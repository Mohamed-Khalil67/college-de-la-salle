import {
  digestText,
  eventNotice,
  gradeNotice,
  homeworkNotice,
  NOTIFICATION_KIND_LABELS,
  NOTIFICATION_KINDS,
  NOTIFICATION_LIMITS,
  notificationLink,
  notificationsPage,
  sessionNotice,
} from './notifications.js';

const base = {
  subject: 'Mathématiques',
  className: null,
  day: '2026-11-03',
  start: '08:30',
  end: '10:00',
} as const;

describe('notification texts', () => {
  it('labels every kind', () => {
    for (const kind of NOTIFICATION_KINDS) expect(NOTIFICATION_KIND_LABELS[kind]).toBeTruthy();
  });

  it('says which session was cancelled, and why', () => {
    const n = sessionNotice({ ...base, kind: 'session_cancelled', reason: 'Enseignant absent' });
    expect(n.title).toBe('Mathématiques : séance du mardi 3 novembre annulée');
    expect(n.body).toBe(
      'La séance de Mathématiques du mardi 3 novembre (08:30 – 10:00) est annulée. Motif : Enseignant absent',
    );
  });

  it('gives the new day, time and room of a moved session, and the class to teachers', () => {
    const n = sessionNotice({
      ...base,
      className: 'Première',
      kind: 'session_moved',
      newDay: '2026-11-05',
      newStart: '14:00',
      newEnd: '15:30',
      newRoom: 'B12',
    });
    expect(n.title).toBe('Mathématiques : séance déplacée au jeudi 5 novembre');
    expect(n.body).toContain('(Première)');
    expect(n.body).toContain('aura lieu le jeudi 5 novembre (14:00 – 15:30), salle B12.');
  });

  it('keeps the day of a session moved to another time only', () => {
    const n = sessionNotice({ ...base, kind: 'session_moved', newStart: '11:00', newEnd: '12:30' });
    expect(n.body).toContain('aura lieu le mardi 3 novembre (11:00 – 12:30).');
  });

  it('names the new room and a restored session', () => {
    expect(
      sessionNotice({ ...base, kind: 'session_room_changed', newRoom: 'Labo 2' }).body,
    ).toContain('a lieu en salle Labo 2.');
    expect(sessionNotice({ ...base, kind: 'session_restored' }).body).toContain('comme prévu');
  });

  it('describes event changes', () => {
    const label = 'Examen — Fonctions';
    expect(
      eventNotice({ kind: 'event_cancelled', label, day: '2026-11-03', start: null }).body,
    ).toBe('« Examen — Fonctions » du mardi 3 novembre est annulé.');
    expect(
      eventNotice({
        kind: 'event_moved',
        label,
        day: '2026-11-03',
        start: '10:00',
        newDay: '2026-11-04',
        newStart: '10:00',
        newEnd: '12:00',
      }).body,
    ).toBe(
      '« Examen — Fonctions », prévu le mardi 3 novembre à 10:00, a lieu le mercredi 4 novembre (10:00 – 12:00).',
    );
    expect(
      eventNotice({
        kind: 'event_room_changed',
        label,
        day: '2026-11-03',
        start: null,
        newPlace: 'Salle B12',
      }).body,
    ).toContain('a lieu en Salle B12.');
  });

  it('announces grades and homework', () => {
    expect(gradeNotice({ title: 'Contrôle 2', subject: 'Physique' }).body).toBe(
      'Votre note de Physique pour « Contrôle 2 » est disponible.',
    );
    expect(
      homeworkNotice({
        title: 'Exercices 4 à 7',
        subject: 'Mathématiques',
        dueDay: '2026-11-03',
        dueTime: null,
      }).body,
    ).toBe('Mathématiques : « Exercices 4 à 7 » à rendre le mardi 3 novembre.');
  });

  it('cuts texts to the stored length', () => {
    const n = gradeNotice({ title: 'x'.repeat(500), subject: null });
    expect(n.title.length).toBeLessThanOrEqual(NOTIFICATION_LIMITS.title);
    expect(n.body.length).toBeLessThanOrEqual(NOTIFICATION_LIMITS.body);
  });
});

describe('e-mail digest', () => {
  it('uses the title as the subject of a single notification', () => {
    const one = gradeNotice({ title: 'Contrôle 2', subject: null });
    const mail = digestText('Nadia', [one], 'https://ecole.eg/eleve/notifications');
    expect(mail.subject).toBe(one.title);
    expect(mail.text).toContain('Bonjour Nadia,');
    expect(mail.text).toContain('Tout voir : https://ecole.eg/eleve/notifications');
  });

  it('groups many notifications and says how many were left out', () => {
    const many = Array.from({ length: NOTIFICATION_LIMITS.digestItems + 3 }, (_, i) =>
      gradeNotice({ title: `Contrôle ${i}`, subject: null }),
    );
    const mail = digestText('Nadia', many, 'https://ecole.eg');
    expect(mail.subject).toBe(
      `${many.length} changements dans votre emploi du temps et vos devoirs`,
    );
    expect(mail.text).toContain('… et 3 autres.');
    expect(mail.text).not.toContain(`Contrôle ${NOTIFICATION_LIMITS.digestItems}`);
  });
});

describe('digest subject', () => {
  it('stays on one line whatever a title contains', () => {
    const one = gradeNotice({ title: 'Contrôle\nBcc: x@y.z\r\n2', subject: null });
    expect(digestText('Nadia', [one], 'https://ecole.eg').subject).not.toMatch(/[\r\n]/);
  });
});

describe('links', () => {
  it('opens the page of the right space', () => {
    expect(notificationLink('student', 'timetable')).toBe('/eleve/emploi-du-temps');
    expect(notificationLink('teacher', 'agenda')).toBe('/enseignant/agenda');
    expect(notificationLink('admin', 'grades')).toBeNull();
    expect(notificationsPage('teacher')).toBe('/enseignant/notifications');
    expect(notificationsPage('student')).toBe('/eleve/notifications');
  });
});
