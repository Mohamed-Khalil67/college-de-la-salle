import { describe, expect, it } from 'vitest';
import type { ActivityTypeSummary, EventDto, OccurrenceDto } from '@cdls/shared';
import { eventIcs, fileName, shiftWeek, weekColumns, weekLabel, weekRange } from './week';

const COURS: ActivityTypeSummary = {
  id: 'type-cours',
  code: 'cours',
  label: 'cours',
  colour: 'navy',
  icon: 'book',
  gradable: false,
  repeatable: true,
  homework: false,
};

const event = (over: Partial<EventDto> = {}): EventDto => ({
  id: 'e1',
  activityTypeId: COURS.id,
  type: COURS,
  title: 'Mathématiques',
  subjectId: 'mathematiques',
  classId: 'c1',
  sectionId: null,
  date: '2026-10-20',
  startTime: '08:30',
  endTime: '10:00',
  repeatUntil: null,
  roomId: null,
  roomName: null,
  place: 'Salle 12',
  periodId: null,
  description: '',
  attachments: [],
  coefficient: 1,
  target: { whole: true, groups: [], studentIds: [], concerned: null },
  authorId: 't1',
  authorName: 'Hany Mansour',
  createdAt: '2026-10-01T08:00:00.000Z',
  updatedAt: '2026-10-01T08:00:00.000Z',
  ...over,
});
const occ = (day: string, over: Partial<EventDto> = {}): OccurrenceDto => ({ key: `e1@${day}`, day, event: event(over) });

describe('week', () => {
  it('keeps Sunday to Thursday and adds weekend days with events', () => {
    expect(weekColumns('2026-10-20', []).map((c) => c.day)).toEqual([
      '2026-10-18',
      '2026-10-19',
      '2026-10-20',
      '2026-10-21',
      '2026-10-22',
    ]);
    const cols = weekColumns('2026-10-20', [occ('2026-10-24'), occ('2026-10-20')]);
    expect(cols.map((c) => c.day).at(-1)).toBe('2026-10-24');
    expect(cols.find((c) => c.day === '2026-10-20')?.items).toHaveLength(1);
  });
  it('computes ranges and labels', () => {
    expect(weekRange('2026-10-20')).toEqual({ from: '2026-10-18', to: '2026-10-24' });
    expect(shiftWeek('2026-10-20', -1)).toBe('2026-10-13');
    expect(weekLabel('2026-10-20')).toBe('Semaine du 18 au 22 octobre 2026');
    expect(weekLabel('2026-11-01')).toBe('Semaine du 1er au 5 novembre 2026');
    expect(weekLabel('2026-12-01')).toBe('Semaine du 29 novembre au 3 décembre 2026');
  });
  it('writes an .ics file and a safe file name', () => {
    const ics = eventIcs(event({ repeatUntil: '2026-12-17' }));
    expect(ics).toContain('DTSTART:20261020T083000');
    expect(ics).toContain('RRULE:FREQ=WEEKLY');
    expect(fileName('Contrôle n° 3 : fonctions', 'ics')).toBe('controle-n-3-fonctions.ics');
    expect(fileName('***', 'pdf')).toBe('fichier.pdf');
  });
});
