import { longDay, type TimetableConflictKind } from '@cdls/shared';

export interface ClashContext {
  readonly kind: TimetableConflictKind;
  /** The day, start and end of the session being placed. */
  readonly date: string;
  readonly startTime: string;
  readonly endTime: string;
  /** The room, teacher or class that is taken. */
  readonly resource: string;
  /** What holds it: « Mathématiques, Première (Hany Mansour) ». */
  readonly holder: string;
  /** Sessions clashing with this same holder. */
  readonly count: number;
}

/** « Salle 12 est déjà occupée le mardi 3 novembre (08:30 – 10:00) par Mathématiques, Première. » */
export function conflictMessage(c: ClashContext): string {
  const when = `${longDay(c.date)} (${c.startTime} – ${c.endTime})`;
  const more =
    c.count > 1
      ? ` Même conflit sur ${c.count - 1} autre${c.count > 2 ? 's' : ''} séance${c.count > 2 ? 's' : ''}.`
      : '';
  switch (c.kind) {
    case 'room':
      return `${c.resource} est déjà occupée le ${when} par ${c.holder}.${more}`;
    case 'teacher':
      return `${c.resource} a déjà une séance le ${when} : ${c.holder}.${more}`;
    case 'class':
      return `${c.resource} a déjà une séance le ${when} : ${c.holder}.${more}`;
  }
}
