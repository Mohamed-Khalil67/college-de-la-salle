import type { ApiError, CalendarDayDto, EventDto, OccurrenceDto } from '@cdls/shared';
import {
  activityTypeId,
  ADMIN,
  bearer,
  COORDINATOR,
  createTestApp,
  MATHS_TEACHER,
  studentOf,
  type TestApp,
} from './helpers.js';

const message = (body: unknown) => String((body as ApiError).message);

/**
 * Holidays and days without classes cancel the weekly sessions of their audience (whole school, a section
 * or some classes), in the occurrences and in the .ics export. Exam weeks and special days do not.
 */
describe('Calendar days (e2e)', () => {
  let t: TestApp;
  let admin: string;
  let coordinator: string;
  let teacher: string;
  let bac: Awaited<ReturnType<typeof studentOf>>;
  let nationale: Awaited<ReturnType<typeof studentOf>>;
  let bacToken: string;
  let nationaleToken: string;
  let yearId: string;
  let bacEvent: EventDto;
  let nationaleEvent: EventDto;
  const created: string[] = [];

  /** Tuesdays 2027-02-02, 09, 16, 23 and 2027-03-02, at 14:00. */
  const TUESDAYS = ['2027-02-02', '2027-02-09', '2027-02-16', '2027-02-23', '2027-03-02'];

  const day = async (body: object) => {
    const res = await t
      .http()
      .post('/api/calendar-days')
      .set(bearer(coordinator))
      .send({ schoolYearId: yearId, ...body })
      .expect(201);
    const dto = res.body as CalendarDayDto;
    created.push(dto.id);
    return dto;
  };
  const daysOf = async (token: string, eventId: string): Promise<string[]> => {
    const res = await t
      .http()
      .get('/api/events/occurrences?from=2027-02-01&to=2027-03-07')
      .set(bearer(token))
      .expect(200);
    return (res.body as OccurrenceDto[]).filter((o) => o.event.id === eventId).map((o) => o.day);
  };

  beforeAll(async () => {
    t = await createTestApp();
    admin = await t.token(ADMIN);
    coordinator = await t.token(COORDINATOR);
    teacher = await t.token(MATHS_TEACHER);
    bac = await studentOf(t.prisma, 'bac', 'premiere');
    nationale = await studentOf(t.prisma, 'nationale', 'secondaire-1');
    bacToken = await t.token(bac.email);
    nationaleToken = await t.token(nationale.email);
    yearId = (await t.prisma.schoolYear.findFirstOrThrow({ where: { isCurrent: true } })).id;

    const cours = await activityTypeId(t.prisma, 'cours');
    const weekly = async (classId: string, title: string) =>
      (
        await t
          .http()
          .post('/api/events')
          .set(bearer(teacher))
          .send({
            activityTypeId: cours,
            title,
            subjectId: 'mathematiques',
            classId,
            date: '2027-02-02',
            startTime: '14:00',
            endTime: '15:00',
            repeatUntil: '2027-03-02',
          })
          .expect(201)
      ).body as EventDto;
    bacEvent = await weekly(bac.classId, 'Soutien Bac');
    nationaleEvent = await weekly(nationale.classId, 'Soutien nationale');
  });

  afterAll(async () => {
    await t.prisma.calendarDay.deleteMany({ where: { id: { in: created } } });
    await t.prisma.event.deleteMany({ where: { id: { in: [bacEvent.id, nationaleEvent.id] } } });
    await t.close();
  });

  it('shows every session when no day is closed', async () => {
    expect(await daysOf(bacToken, bacEvent.id)).toEqual(TUESDAYS);
    expect(await daysOf(nationaleToken, nationaleEvent.id)).toEqual(TUESDAYS);
  });

  it('keeps the sessions on exam weeks and special days', async () => {
    await day({
      type: 'exam_week',
      label: 'Semaine d’examens',
      startsOn: '2027-02-01',
      endsOn: '2027-02-05',
    });
    await day({
      type: 'event_day',
      label: 'Journée sportive',
      startsOn: '2027-02-09',
      endsOn: '2027-02-09',
    });
    expect(await daysOf(bacToken, bacEvent.id)).toEqual(TUESDAYS);
  });

  it('skips the sessions of a whole-school « pas de cours » day, for everyone', async () => {
    await day({ type: 'no_classes', label: 'Pont', startsOn: '2027-02-09', endsOn: '2027-02-09' });
    expect(await daysOf(bacToken, bacEvent.id)).toEqual(TUESDAYS.filter((d) => d !== '2027-02-09'));
    expect(await daysOf(nationaleToken, nationaleEvent.id)).toEqual(
      TUESDAYS.filter((d) => d !== '2027-02-09'),
    );
  });

  it('skips only the sessions of a section for a section holiday', async () => {
    const bacSection = await t.prisma.section.findFirstOrThrow({ where: { code: 'bac' } });
    await day({
      type: 'holiday',
      label: 'Vacances du Bac français',
      startsOn: '2027-02-15',
      endsOn: '2027-02-21',
      sectionId: bacSection.id,
    });
    expect(await daysOf(bacToken, bacEvent.id)).toEqual(['2027-02-02', '2027-02-23', '2027-03-02']);
    expect(await daysOf(nationaleToken, nationaleEvent.id)).toEqual(
      TUESDAYS.filter((d) => d !== '2027-02-09'),
    );
  });

  it('skips only the sessions of the listed classes', async () => {
    await day({
      type: 'holiday',
      label: 'Sortie de la Première',
      startsOn: '2027-02-23',
      endsOn: '2027-02-23',
      classIds: [bac.classId],
    });
    await day({
      type: 'holiday',
      label: 'Sortie de la 1re secondaire',
      startsOn: '2027-03-02',
      endsOn: '2027-03-02',
      classIds: [nationale.classId],
    });
    expect(await daysOf(bacToken, bacEvent.id)).toEqual(['2027-02-02', '2027-03-02']);
    expect(await daysOf(nationaleToken, nationaleEvent.id)).toEqual([
      '2027-02-02',
      '2027-02-16',
      '2027-02-23',
    ]);
  });

  it('keeps one-off events on a holiday: someone chose that day', async () => {
    const cours = await activityTypeId(t.prisma, 'cours');
    const oneOff = (
      await t
        .http()
        .post('/api/events')
        .set(bearer(teacher))
        .send({
          activityTypeId: cours,
          title: 'Rattrapage',
          subjectId: 'mathematiques',
          classId: bac.classId,
          date: '2027-02-16',
        })
        .expect(201)
    ).body as EventDto;
    expect(await daysOf(bacToken, oneOff.id)).toEqual(['2027-02-16']);
    await t.prisma.event.delete({ where: { id: oneOff.id } });
  });

  it('keeps events of the whole school during a one-section holiday', async () => {
    const cours = await activityTypeId(t.prisma, 'cours');
    const schoolWide = (
      await t
        .http()
        .post('/api/events')
        .set(bearer(teacher))
        .send({
          activityTypeId: cours,
          title: 'Chorale',
          date: '2027-02-16',
          startTime: '12:00',
          endTime: '13:00',
          repeatUntil: '2027-02-23',
        })
        .expect(201)
    ).body as EventDto;
    expect(await daysOf(bacToken, schoolWide.id)).toEqual(['2027-02-16', '2027-02-23']);
    await t.prisma.event.delete({ where: { id: schoolWide.id } });
  });

  it('writes an EXDATE line for each cancelled session in the .ics export', async () => {
    const ics = (
      await t.http().get(`/api/events/${bacEvent.id}/ics`).set(bearer(bacToken)).expect(200)
    ).text;
    expect(ics).toContain('RRULE:FREQ=WEEKLY;UNTIL=20270302T235959');
    const exdates = ics.split('\r\n').filter((l) => l.startsWith('EXDATE'));
    expect(exdates).toEqual([
      'EXDATE:20270209T140000',
      'EXDATE:20270216T140000',
      'EXDATE:20270223T140000',
    ]);

    const other = (
      await t
        .http()
        .get(`/api/events/${nationaleEvent.id}/ics`)
        .set(bearer(nationaleToken))
        .expect(200)
    ).text;
    expect(other.split('\r\n').filter((l) => l.startsWith('EXDATE'))).toEqual([
      'EXDATE:20270209T140000',
      'EXDATE:20270302T140000',
    ]);
  });

  it('brings the sessions back when the day is removed', async () => {
    const days = (
      await t
        .http()
        .get('/api/calendar-days?schoolYearId=' + yearId + '&from=2027-02-09&to=2027-02-09')
        .set(bearer(bacToken))
        .expect(200)
    ).body as CalendarDayDto[];
    const pont = days.find((d) => d.label === 'Pont')!;
    await t.http().delete(`/api/calendar-days/${pont.id}`).set(bearer(admin)).expect(204);
    expect(await daysOf(bacToken, bacEvent.id)).toEqual(['2027-02-02', '2027-02-09', '2027-03-02']);
  });

  it('does not offer a roll call on a closed day', async () => {
    const res = await t
      .http()
      .get(`/api/events/${bacEvent.id}/attendance?date=2027-02-16`)
      .set(bearer(teacher))
      .expect(400);
    expect(message(res.body)).toMatch(/n'a pas lieu/);
    await t
      .http()
      .get(`/api/events/${bacEvent.id}/attendance?date=2027-02-09`)
      .set(bearer(teacher))
      .expect(200);
  });

  describe('validation', () => {
    it('keeps days inside their school year and their end after their start', async () => {
      const send = (body: object) =>
        t
          .http()
          .post('/api/calendar-days')
          .set(bearer(admin))
          .send({ schoolYearId: yearId, type: 'holiday', label: 'x', ...body });
      expect(
        message((await send({ startsOn: '2030-01-01', endsOn: '2030-01-02' }).expect(400)).body),
      ).toMatch(/comprises dans l’année/);
      expect(
        message((await send({ startsOn: '2027-02-10', endsOn: '2027-02-09' }).expect(400)).body),
      ).toMatch(/fin ne peut pas précéder/);
    });

    it('takes classes of that year and section only', async () => {
      const nationaleSection = await t.prisma.section.findFirstOrThrow({
        where: { code: 'nationale' },
      });
      await t
        .http()
        .post('/api/calendar-days')
        .set(bearer(admin))
        .send({
          schoolYearId: yearId,
          type: 'holiday',
          label: 'Mélange',
          startsOn: '2027-02-10',
          endsOn: '2027-02-10',
          sectionId: nationaleSection.id,
          classIds: [bac.classId],
        })
        .expect(400);
    });

    it('is readable by every signed-in user, and by nobody anonymous', async () => {
      await t.http().get('/api/calendar-days?schoolYearId=' + yearId).set(bearer(bacToken)).expect(200);
      await t.http().get('/api/calendar-days?schoolYearId=' + yearId).expect(401);
    });
  });
});
