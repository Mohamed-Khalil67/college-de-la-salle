import type { CreatedUserResponse, SessionResponse } from '@cdls/shared';
import { ADMIN, bearer, createTestApp, type TestApp } from './helpers.js';

const cookieOf = (res: { headers: Record<string, unknown> }) => {
  const header = res.headers['set-cookie'] as string[] | undefined;
  return header?.find((c) => c.startsWith('cdls_refresh='))?.split(';')[0] ?? '';
};

const NEW_PASSWORD = 'Cedre-du-Liban-2026';
const INVALID_LINK = 'Ce lien est invalide ou a expiré. Demandez-en un nouveau.';

/** « Mot de passe oublié »: request a link by e-mail, then choose a new password with it. */
describe('Password reset (e2e)', () => {
  let t: TestApp;
  let admin: string;

  beforeAll(async () => {
    t = await createTestApp();
    admin = await t.token(ADMIN);
  });

  afterAll(() => t.close());

  /** An active teacher with a known password (chosen through the first-sign-in route). */
  async function newAccount(firstName: string, password = 'Mot-de-passe-initial-1') {
    const res = await t
      .http()
      .post('/api/users')
      .set(bearer(admin))
      .send({ role: 'teacher', firstName, lastName: `Reset${Math.random().toString(36).slice(2, 8)}` })
      .expect(201);
    const created = res.body as CreatedUserResponse;
    const login = await t
      .http()
      .post('/api/auth/login')
      .send({ email: created.user.email, password: created.temporaryPassword })
      .expect(200);
    await t
      .http()
      .post('/api/auth/password')
      .set(bearer((login.body as SessionResponse).accessToken))
      .send({ currentPassword: created.temporaryPassword, newPassword: password })
      .expect(200);
    return { id: created.user.id, email: created.user.email, password };
  }

  const loginWith = (email: string, password: string) =>
    t.http().post('/api/auth/login').send({ email, password });

  /** Asks for a link and returns the token read from the mail that went out. */
  async function requestLink(email: string, identifier = email): Promise<string> {
    const before = t.mails.filter((m) => m.to === email).length;
    await t.http().post('/api/auth/forgot-password').send({ identifier }).expect(204);
    await vi.waitFor(() => expect(t.mails.filter((m) => m.to === email).length).toBe(before + 1));
    const mail = t.mails.filter((m) => m.to === email).at(-1)!;
    const token = /\/connexion\/reinitialiser\?token=([\w-]+)/.exec(mail.text)?.[1];
    expect(token, 'the mail carries the link').toBeTruthy();
    return token!;
  }

  const reset = (token: string, newPassword = NEW_PASSWORD) =>
    t.http().post('/api/auth/reset-password').send({ token, newPassword });

  it('mails a link, sets the password once, ends every session and audits it', async () => {
    const account = await newAccount('Reset');
    const first = await loginWith(account.email, account.password).expect(200);
    const session = first.body as SessionResponse;
    const refresh = cookieOf(first);

    const token = await requestLink(account.email, ` ${account.email.toUpperCase()} `);
    const mail = t.mails.filter((m) => m.to === account.email).at(-1)!;
    expect(mail.subject).toBe('Réinitialisation de votre mot de passe');
    expect(mail.text).toContain('http://localhost:4200/connexion/reinitialiser?token=');
    // Only the HMAC is stored, never the token itself.
    const stored = await t.prisma.passwordResetToken.findMany({ where: { userId: account.id } });
    expect(stored).toHaveLength(1);
    expect(stored[0]!.tokenHash).not.toContain(token);

    // A weak password is refused without spending the link.
    await reset(token, 'court').expect(400);
    await reset(token, account.email).expect(400);

    await reset(token).expect(204);

    // The old password is gone, the new one works, and the account no longer has to change it.
    await loginWith(account.email, account.password).expect(401);
    const fresh = await loginWith(account.email, NEW_PASSWORD).expect(200);
    expect((fresh.body as SessionResponse).user.mustChangePassword).toBe(false);
    const row = await t.prisma.user.findUniqueOrThrow({ where: { id: account.id } });
    expect(row.mustChangePassword).toBe(false);
    expect(row.temporaryPasswordExpiresAt).toBeNull();
    expect(row.passwordChangedAt).not.toBeNull();

    // The other sessions ended: the access token and the refresh cookie issued before are refused.
    await t.http().get('/api/auth/me').set(bearer(session.accessToken)).expect(401);
    await t.http().post('/api/auth/refresh').set('Cookie', refresh).expect(401);

    const trace = await t.prisma.auditLog.findFirstOrThrow({
      where: { action: 'user.password_reset_self', entityId: account.id },
    });
    expect(trace.actorId).toBe(account.id);
    const written = JSON.stringify(trace, (_key, value: unknown) =>
      typeof value === 'bigint' ? value.toString() : value,
    );
    expect(written).not.toContain(token);
    expect(written).not.toContain(NEW_PASSWORD);
  });

  it('refuses a link that was already used', async () => {
    const account = await newAccount('Reuse');
    const token = await requestLink(account.email);
    await reset(token).expect(204);
    const again = await reset(token, 'Une-autre-phrase-2026').expect(400);
    expect((again.body as { message: string }).message).toBe(INVALID_LINK);
    await loginWith(account.email, NEW_PASSWORD).expect(200);
  });

  it('refuses a wrong, malformed or expired token', async () => {
    const account = await newAccount('Expired');
    const token = await requestLink(account.email);
    await reset('A'.repeat(43)).expect(400);
    await reset(`${token}x`).expect(400);

    await t.prisma.passwordResetToken.updateMany({
      where: { userId: account.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const expired = await reset(token).expect(400);
    expect((expired.body as { message: string }).message).toBe(INVALID_LINK);
    // The password did not change.
    await loginWith(account.email, account.password).expect(200);
  });

  it('a new request invalidates the earlier link', async () => {
    const account = await newAccount('Twice');
    const older = await requestLink(account.email);
    const newer = await requestLink(account.email);
    expect(newer).not.toBe(older);
    await reset(older).expect(400);
    await reset(newer).expect(204);
  });

  it('answers 204 for any identifier and sends nothing to unknown, disabled or archived accounts', async () => {
    const disabled = await newAccount('Disabled');
    const archived = await newAccount('Archived');
    await t.prisma.user.update({ where: { id: disabled.id }, data: { status: 'disabled' } });
    await t.prisma.user.update({ where: { id: archived.id }, data: { status: 'archived' } });
    const sent = t.mails.length;

    for (const identifier of [disabled.email, archived.email, 'personne@demo.cdls.test', 'pas une adresse']) {
      await t.http().post('/api/auth/forgot-password').send({ identifier }).expect(204);
    }
    // Give a wrongly started background send the time to show up.
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(t.mails).toHaveLength(sent);
    expect(await t.prisma.passwordResetToken.count({ where: { userId: { in: [disabled.id, archived.id] } } })).toBe(0);

    await t.http().post('/api/auth/forgot-password').send({}).expect(400);
  });

  it('refuses a link whose account was disabled after the request', async () => {
    const account = await newAccount('Later');
    const token = await requestLink(account.email);
    await t.prisma.user.update({ where: { id: account.id }, data: { status: 'disabled' } });
    await reset(token).expect(400);
    await t.prisma.user.update({ where: { id: account.id }, data: { status: 'active' } });
    await reset(token).expect(204);
  });

  it('limits requests per address and e-mail', async () => {
    const identifier = 'limite@demo.cdls.test';
    const limit = Number(process.env['LOGIN_THROTTLE_LIMIT'] ?? 5);
    for (let i = 0; i < limit; i++)
      await t.http().post('/api/auth/forgot-password').send({ identifier }).expect(204);
    await t.http().post('/api/auth/forgot-password').send({ identifier }).expect(429);
    // Another e-mail from the same address still goes through.
    await t.http().post('/api/auth/forgot-password').send({ identifier: 'autre@demo.cdls.test' }).expect(204);
  });
});
