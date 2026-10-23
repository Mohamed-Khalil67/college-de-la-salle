import { longDay } from './calendar.js';

/**
 * In-app notifications: a session or an event that concerns the user was cancelled, moved or given
 * another room, a grade was published, a homework assigned. The API writes them in the same transaction
 * as the change; the texts are composed here, in French, so the web and the e-mail digest agree.
 */

export const NOTIFICATION_KINDS = [
  'session_cancelled',
  'session_moved',
  'session_room_changed',
  'session_restored',
  'event_cancelled',
  'event_moved',
  'event_room_changed',
  'grade_published',
  'homework_assigned',
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const NOTIFICATION_KIND_LABELS: Readonly<Record<NotificationKind, string>> = {
  session_cancelled: 'Séance annulée',
  session_moved: 'Séance déplacée',
  session_room_changed: 'Salle changée',
  session_restored: 'Séance rétablie',
  event_cancelled: 'Événement annulé',
  event_moved: 'Événement déplacé',
  event_room_changed: 'Lieu changé',
  grade_published: 'Note publiée',
  homework_assigned: 'Nouveau devoir',
};

/** Session and event changes: what the feed and the timetable show differently now. */
export const SCHEDULE_NOTIFICATION_KINDS: readonly NotificationKind[] = [
  'session_cancelled',
  'session_moved',
  'session_room_changed',
  'session_restored',
  'event_cancelled',
  'event_moved',
  'event_room_changed',
];

export const NOTIFICATION_LIMITS = {
  title: 160,
  body: 600,
  /** Notifications one e-mail digest lists before « et N autres ». */
  digestItems: 15,
} as const;

/** What is shown: a short title and one or two sentences. */
export interface NotificationText {
  readonly title: string;
  readonly body: string;
}

const cut = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;
const clean = (n: NotificationText): NotificationText => ({
  title: cut(n.title, NOTIFICATION_LIMITS.title),
  body: cut(n.body, NOTIFICATION_LIMITS.body),
});
const at = (start: string | null | undefined, end?: string | null) =>
  start ? (end ? ` (${start} – ${end})` : ` à ${start}`) : '';
const why = (reason: string | null | undefined) =>
  reason?.trim() ? ` Motif : ${reason.trim()}` : '';

/** One session of the timetable, before and after its change. */
export interface SessionChangeFacts {
  readonly kind: Extract<
    NotificationKind,
    'session_cancelled' | 'session_moved' | 'session_room_changed' | 'session_restored'
  >;
  readonly subject: string;
  /** The class, for teachers (« Bac français — Première »); null for students. */
  readonly className: string | null;
  readonly day: string;
  readonly start: string;
  readonly end: string;
  readonly newDay?: string | null;
  readonly newStart?: string | null;
  readonly newEnd?: string | null;
  readonly newRoom?: string | null;
  readonly reason?: string | null;
}

export function sessionNotice(f: SessionChangeFacts): NotificationText {
  const who = f.className ? ` (${f.className})` : '';
  const when = `${longDay(f.day)}${at(f.start, f.end)}`;
  switch (f.kind) {
    case 'session_cancelled':
      return clean({
        title: `${f.subject} : séance du ${longDay(f.day)} annulée`,
        body: `La séance de ${f.subject}${who} du ${when} est annulée.${why(f.reason)}`,
      });
    case 'session_moved': {
      const day = f.newDay ?? f.day;
      return clean({
        title: `${f.subject} : séance déplacée au ${longDay(day)}`,
        body: `La séance de ${f.subject}${who} prévue le ${when} aura lieu le ${longDay(day)}${at(f.newStart ?? f.start, f.newEnd ?? f.end)}${f.newRoom ? `, salle ${f.newRoom}` : ''}.${why(f.reason)}`,
      });
    }
    case 'session_room_changed':
      return clean({
        title: `${f.subject} : changement de salle le ${longDay(f.day)}`,
        body: `La séance de ${f.subject}${who} du ${when} a lieu en salle ${f.newRoom ?? 'à préciser'}.${why(f.reason)}`,
      });
    case 'session_restored':
      return clean({
        title: `${f.subject} : séance du ${longDay(f.day)} rétablie`,
        body: `La séance de ${f.subject}${who} du ${when} a lieu comme prévu à l’emploi du temps.`,
      });
  }
}

/** A one-off event (exam, outing, homework deadline…), before and after its change. */
export interface EventChangeFacts {
  readonly kind: Extract<
    NotificationKind,
    'event_cancelled' | 'event_moved' | 'event_room_changed'
  >;
  /** « Examen — Fonctions » */
  readonly label: string;
  readonly day: string;
  readonly start: string | null;
  readonly newDay?: string | null;
  readonly newStart?: string | null;
  readonly newEnd?: string | null;
  /** The room or place now. */
  readonly newPlace?: string | null;
}

export function eventNotice(f: EventChangeFacts): NotificationText {
  switch (f.kind) {
    case 'event_cancelled':
      return clean({
        title: `${f.label} : annulé`,
        body: `« ${f.label} » du ${longDay(f.day)}${at(f.start)} est annulé.`,
      });
    case 'event_moved': {
      const day = f.newDay ?? f.day;
      return clean({
        title: `${f.label} : déplacé au ${longDay(day)}`,
        body: `« ${f.label} », prévu le ${longDay(f.day)}${at(f.start)}, a lieu le ${longDay(day)}${at(f.newStart, f.newEnd)}${f.newPlace ? ` (${f.newPlace})` : ''}.`,
      });
    }
    case 'event_room_changed':
      return clean({
        title: `${f.label} : nouveau lieu`,
        body: `« ${f.label} » du ${longDay(f.day)}${at(f.start)} a lieu ${f.newPlace ? `en ${f.newPlace}` : 'dans un lieu à préciser'}.`,
      });
  }
}

/** A grade of the student was published. */
export function gradeNotice(f: {
  readonly title: string;
  readonly subject: string | null;
}): NotificationText {
  return clean({
    title: `Note publiée : ${f.title}`,
    body: `Votre note${f.subject ? ` de ${f.subject}` : ''} pour « ${f.title} » est disponible.`,
  });
}

/** A homework that concerns the student was assigned. */
export function homeworkNotice(f: {
  readonly title: string;
  readonly subject: string | null;
  readonly dueDay: string;
  readonly dueTime: string | null;
}): NotificationText {
  return clean({
    title: `Nouveau devoir : ${f.title}`,
    body: `${f.subject ? `${f.subject} : ` : ''}« ${f.title} » à rendre le ${longDay(f.dueDay)}${at(f.dueTime)}.`,
  });
}

/** The e-mail digest of several notifications (plain text, French). */
export function digestText(
  firstName: string,
  items: readonly NotificationText[],
  link: string,
): { readonly subject: string; readonly text: string } {
  const shown = items.slice(0, NOTIFICATION_LIMITS.digestItems);
  const more = items.length - shown.length;
  const subject =
    items.length === 1
      ? shown[0]!.title
      : `${items.length} changements dans votre emploi du temps et vos devoirs`;
  const text = [
    `Bonjour ${firstName},`,
    '',
    items.length === 1
      ? 'Voici une nouvelle qui vous concerne :'
      : 'Voici les nouvelles qui vous concernent :',
    '',
    ...shown.flatMap((n) => [`• ${n.title}`, `  ${n.body}`, '']),
    ...(more > 0 ? [`… et ${more} autre${more > 1 ? 's' : ''}.`, ''] : []),
    `Tout voir : ${link}`,
    '',
    'Vous recevez ce message parce que vous avez activé les notifications par e-mail. Vous pouvez les désactiver depuis la page Notifications de votre espace.',
    '',
    'Collège de la Salle',
  ].join('\n');
  // One line, whatever a teacher typed in a title.
  return { subject: cut(subject.replace(/\s+/g, ' ').trim(), NOTIFICATION_LIMITS.title), text };
}

/** The page a notification opens: the screen of the user's space that shows what changed. */
export type NotificationTopic = 'timetable' | 'agenda' | 'homework' | 'grades';

const SPACE_PAGES: Readonly<
  Record<'student' | 'teacher', Readonly<Record<NotificationTopic, string>>>
> = {
  student: {
    timetable: '/eleve/emploi-du-temps',
    agenda: '/eleve/agenda',
    homework: '/eleve/devoirs',
    grades: '/eleve/notes',
  },
  teacher: {
    timetable: '/enseignant/emploi-du-temps',
    agenda: '/enseignant/agenda',
    homework: '/enseignant/agenda',
    grades: '/enseignant/notes',
  },
};

/** The link of a notification for this role; null for a role without a space page (the admin). */
export function notificationLink(role: string, topic: NotificationTopic): string | null {
  return role === 'student' || role === 'teacher' ? SPACE_PAGES[role][topic] : null;
}

/** The notifications page of a role's space (the e-mail digest links to it). */
export function notificationsPage(role: string): string {
  return role === 'teacher' ? '/enseignant/notifications' : '/eleve/notifications';
}
