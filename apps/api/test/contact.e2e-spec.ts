import type { ContactMessageDto, HandleContactMessagesResponse, Paginated } from '@cdls/shared';
import { ContactRetentionService } from '../src/contact/contact-retention.service.js';
import { ADMIN, bearer, createTestApp, MATHS_TEACHER, studentOf, type TestApp } from './helpers.js';

const MESSAGE = {
  name: '  Mariam Saad ',
  email: 'mariam.saad@example.com',
  subject: 'Demande d’inscription',
  message: 'Bonjour, je souhaite inscrire mon fils en Seconde.',
  phone: '+20 100 000 0000',
  track: 'Bac français, lycée',
};

describe('Contact messages (e2e)', () => {
  let t: TestApp;
  let limitBefore: string | undefined;

  beforeAll(async () => {
    t = await createTestApp();
    limitBefore = process.env['CONTACT_THROTTLE_LIMIT'];
    // Read per request: enough for this file's messages, low enough to test the limit.
    process.env['CONTACT_THROTTLE_LIMIT'] = '5';
  });

  afterAll(async () => {
    if (limitBefore === undefined) delete process.env['CONTACT_THROTTLE_LIMIT'];
    else process.env['CONTACT_THROTTLE_LIMIT'] = limitBefore;
    await t.close();
  });

  it('a visitor sends a message without signing in; the admin reads it and marks it handled', async () => {
    const res = await t.http().post('/api/contact').send(MESSAGE).expect(204);
    expect(res.body).toEqual({});

    const admin = await t.token(ADMIN);
    const list = await t
      .http()
      .get('/api/contact-messages?handled=false&pageSize=5')
      .set(bearer(admin))
      .expect(200);
    const page = list.body as Paginated<ContactMessageDto>;
    const stored = page.items.find((m) => m.email === MESSAGE.email);
    expect(stored).toMatchObject({
      name: 'Mariam Saad',
      subject: MESSAGE.subject,
      message: MESSAGE.message,
      phone: MESSAGE.phone,
      track: MESSAGE.track,
      handledAt: null,
      handledByName: null,
    });
    expect(page.pageSize).toBe(5);

    const handled = await t
      .http()
      .patch(`/api/contact-messages/${stored!.id}`)
      .set(bearer(admin))
      .send({ handled: true })
      .expect(200);
    expect((handled.body as ContactMessageDto).handledAt).not.toBeNull();
    expect((handled.body as ContactMessageDto).handledByName).toBe('Nadia Fahmy');
    expect(
      await t.prisma.auditLog.count({
        where: { action: 'contact_message.handle', entityId: stored!.id },
      }),
    ).toBe(1);

    const waiting = await t
      .http()
      .get('/api/contact-messages?handled=false')
      .set(bearer(admin))
      .expect(200);
    expect(
      (waiting.body as Paginated<ContactMessageDto>).items.some((m) => m.id === stored!.id),
    ).toBe(false);
    const done = await t
      .http()
      .get('/api/contact-messages?handled=true')
      .set(bearer(admin))
      .expect(200);
    expect((done.body as Paginated<ContactMessageDto>).items.some((m) => m.id === stored!.id)).toBe(
      true,
    );

    const reopened = await t
      .http()
      .patch(`/api/contact-messages/${stored!.id}`)
      .set(bearer(admin))
      .send({ handled: false })
      .expect(200);
    expect(reopened.body).toMatchObject({ handledAt: null, handledByName: null });
  });

  it('validates the message and answers in French', async () => {
    const res = await t
      .http()
      .post('/api/contact')
      .send({ ...MESSAGE, email: 'pas-une-adresse', message: '   ' })
      .expect(400);
    const text = JSON.stringify(res.body);
    expect(text).toContain('Saisissez une adresse e-mail complète');
    expect(text).toContain('Écrivez votre message.');
    await t
      .http()
      .post('/api/contact')
      .send({ ...MESSAGE, message: 'x'.repeat(1001) })
      .expect(400);
    // Unknown fields are refused, like everywhere else.
    await t
      .http()
      .post('/api/contact')
      .send({ ...MESSAGE, handledAt: new Date().toISOString() })
      .expect(400);
  });

  it('only admins read and handle the messages', async () => {
    const student = await studentOf(t.prisma, 'bac', 'premiere');
    const message = await t.prisma.contactMessage.findFirstOrThrow();
    await t.http().get('/api/contact-messages').expect(401);
    for (const email of [student.email, MATHS_TEACHER]) {
      const token = await t.token(email);
      await t.http().get('/api/contact-messages').set(bearer(token)).expect(403);
      await t
        .http()
        .patch(`/api/contact-messages/${message.id}`)
        .set(bearer(token))
        .send({ handled: true })
        .expect(403);
    }
    const admin = await t.token(ADMIN);
    await t
      .http()
      .patch('/api/contact-messages/00000000-0000-7000-8000-000000000000')
      .set(bearer(admin))
      .send({ handled: true })
      .expect(404);
  });

  it('the admin marks a selection handled at once, audited per message', async () => {
    // Stored directly: POST /contact is rate-limited, and the last test of this file needs its quota.
    const [a, b, done] = await Promise.all(
      ['bulk.a', 'bulk.b', 'bulk.done'].map((name) =>
        t.prisma.contactMessage.create({
          data: { name, email: `${name}@example.com`, subject: 'Visite', message: 'Bonjour' },
        }),
      ),
    );
    const admin = await t.token(ADMIN);
    await t
      .http()
      .post('/api/contact-messages/handle')
      .set(bearer(admin))
      .send({ ids: [done!.id] })
      .expect(200);
    const res = await t
      .http()
      .post('/api/contact-messages/handle')
      .set(bearer(admin))
      .send({ ids: [a!.id, b!.id, done!.id, '00000000-0000-7000-8000-000000000000'] })
      .expect(200);
    // The one already handled and the unknown id are skipped.
    expect(res.body as HandleContactMessagesResponse).toEqual({ handled: 2 });
    const rows = await t.prisma.contactMessage.findMany({
      where: { id: { in: [a!.id, b!.id] } },
      include: { handledBy: true },
    });
    expect(rows.every((r) => r.handledAt && r.handledBy?.email === ADMIN)).toBe(true);
    expect(
      await t.prisma.auditLog.count({
        where: { action: 'contact_message.handle', entityId: { in: [a!.id, b!.id, done!.id] } },
      }),
    ).toBe(3);
  });

  it('refuses an empty, oversized or malformed selection', async () => {
    const admin = await t.token(ADMIN);
    const send = (body: unknown) =>
      t.http().post('/api/contact-messages/handle').set(bearer(admin)).send(body);
    await send({ ids: [] }).expect(400);
    await send({}).expect(400);
    await send({ ids: ['pas-un-id'] }).expect(400);
    const id = '00000000-0000-7000-8000-000000000000';
    await send({ ids: [id, id] }).expect(400);
    const many = Array.from(
      { length: 101 },
      (_, i) => `00000000-0000-7000-8000-${String(i).padStart(12, '0')}`,
    );
    const res = await send({ ids: many }).expect(400);
    expect(JSON.stringify(res.body)).toContain('100 messages au plus');
    await send({ ids: many.slice(0, 100) }).expect(200);
  });

  it('the admin deletes a message, audited; it is gone for good', async () => {
    const message = await t.prisma.contactMessage.create({
      data: { name: 'Spam', email: 'spam@example.com', subject: 'Promo', message: 'Achetez' },
    });
    const admin = await t.token(ADMIN);
    await t.http().delete(`/api/contact-messages/${message.id}`).set(bearer(admin)).expect(204);
    expect(await t.prisma.contactMessage.findUnique({ where: { id: message.id } })).toBeNull();
    const trace = await t.prisma.auditLog.findFirstOrThrow({
      where: { action: 'contact_message.delete', entityId: message.id },
      include: { actor: true },
    });
    expect(trace.actor?.email).toBe(ADMIN);
    // The trace keeps no visitor details.
    expect(JSON.stringify(trace.before)).not.toContain('spam@example.com');
    await t.http().delete(`/api/contact-messages/${message.id}`).set(bearer(admin)).expect(404);
    await t.http().delete('/api/contact-messages/pas-un-id').set(bearer(admin)).expect(400);
  });

  it('only admins delete or bulk-handle messages', async () => {
    const student = await studentOf(t.prisma, 'bac', 'premiere');
    const message = await t.prisma.contactMessage.create({
      data: { name: 'Kept', email: 'kept@example.com', subject: 'Visite', message: 'Bonjour' },
    });
    await t.http().delete(`/api/contact-messages/${message.id}`).expect(401);
    await t
      .http()
      .post('/api/contact-messages/handle')
      .send({ ids: [message.id] })
      .expect(401);
    for (const email of [student.email, MATHS_TEACHER]) {
      const token = await t.token(email);
      await t.http().delete(`/api/contact-messages/${message.id}`).set(bearer(token)).expect(403);
      await t
        .http()
        .post('/api/contact-messages/handle')
        .set(bearer(token))
        .send({ ids: [message.id] })
        .expect(403);
    }
    expect(
      await t.prisma.contactMessage.findUniqueOrThrow({ where: { id: message.id } }),
    ).toMatchObject({
      handledAt: null,
    });
    const admin = await t.token(ADMIN);
    await t
      .http()
      .delete('/api/contact-messages/00000000-0000-7000-8000-000000000000')
      .set(bearer(admin))
      .expect(404);
  });

  it('retention deletes handled messages past CONTACT_RETENTION_DAYS, never waiting ones', async () => {
    const day = 24 * 60 * 60 * 1000;
    const now = new Date();
    const old = new Date(now.getTime() - 400 * day);
    const recent = new Date(now.getTime() - 30 * day);
    const create = (name: string, handledAt: Date | null) =>
      t.prisma.contactMessage.create({
        data: {
          name,
          email: `${name}@example.com`,
          subject: 'Ancien',
          message: 'Bonjour',
          createdAt: old,
          handledAt,
        },
      });
    const expired = await create('retention.expired', old);
    const kept = await create('retention.recent', recent);
    const waiting = await create('retention.waiting', null);

    // 365 days by default (the e2e environment does not set it).
    const deleted = await t.app.get(ContactRetentionService).run(now);
    expect(deleted).toBeGreaterThanOrEqual(1);
    const left = await t.prisma.contactMessage.findMany({
      where: { id: { in: [expired.id, kept.id, waiting.id] } },
      select: { id: true },
    });
    expect(left.map((m) => m.id).sort()).toEqual([kept.id, waiting.id].sort());
    expect(
      await t.prisma.auditLog.count({
        where: { action: 'contact_message.purge', actorId: null },
      }),
    ).toBeGreaterThanOrEqual(1);
  });

  it('answers a robot that fills the honeypot like anyone else, and drops its message', async () => {
    const before = await t.prisma.contactMessage.count();
    await t
      .http()
      .post('/api/contact')
      .send({ ...MESSAGE, email: 'robot@example.com', website: 'https://spam.example' })
      .expect(204);
    expect(await t.prisma.contactMessage.count()).toBe(before);
  });

  it('limits how many messages one client sends a minute', async () => {
    // 5 a minute in this file; the 400s and the robot above count too, so the limit is reached.
    const res = await t.http().post('/api/contact').send(MESSAGE);
    expect(res.status).toBe(429);
  });
});
