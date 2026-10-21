import { conflictMessage } from './conflict-messages.js';

const base = {
  date: '2026-11-03',
  startTime: '08:30',
  endTime: '10:00',
  holder: 'Mathématiques, Première (Hany Mansour)',
  count: 1,
};

describe('conflictMessage', () => {
  it('names the room, the day, the time and what holds it', () => {
    expect(conflictMessage({ ...base, kind: 'room', resource: 'Salle 12' })).toBe(
      'Salle 12 est déjà occupée le mardi 3 novembre (08:30 – 10:00) par Mathématiques, Première (Hany Mansour).',
    );
  });

  it('names a teacher and a class', () => {
    expect(conflictMessage({ ...base, kind: 'teacher', resource: 'Hany Mansour' })).toMatch(
      /^Hany Mansour a déjà une séance le mardi 3 novembre/,
    );
    expect(conflictMessage({ ...base, kind: 'class', resource: 'La classe Première' })).toMatch(
      /^La classe Première a déjà une séance/,
    );
  });

  it('counts the other sessions that clash in the same way', () => {
    expect(conflictMessage({ ...base, kind: 'room', resource: 'Salle 12', count: 2 })).toMatch(
      /Même conflit sur 1 autre séance\.$/,
    );
    expect(conflictMessage({ ...base, kind: 'room', resource: 'Salle 12', count: 5 })).toMatch(
      /Même conflit sur 4 autres séances\.$/,
    );
  });
});
