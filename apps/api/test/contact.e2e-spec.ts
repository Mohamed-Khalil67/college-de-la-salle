import type { ContactMessageDto, Paginated } from '@cdls/shared';
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
    process.env['CONTACT_THROTTLE_LIMIT'] = '4';
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

  it('limits how many messages one client sends a minute', async () => {
    // 4 a minute in this file; the 400s above count too, so the limit is already reached.
    const res = await t.http().post('/api/contact').send(MESSAGE);
    expect(res.status).toBe(429);
  });
});
