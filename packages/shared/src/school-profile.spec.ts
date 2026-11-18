import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toFeedIcs, vtimezone, zoneOffsetMinutes } from './feed.js';
import {
  isTimeZone,
  loginExample,
  parseSchoolProfile,
  schoolProfileProblems,
  schoolTitle,
  sectionLabels,
} from './school-profile.js';
import { dayInZone, timeInZone } from './timetable.js';

/** The packs of the repository (`schools/<id>/profile.json`): every one must be valid. */
const SCHOOLS = join(dirname(fileURLToPath(import.meta.url)), '../../../schools');
const packs = readdirSync(SCHOOLS, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

function readPack(id: string): unknown {
  return JSON.parse(readFileSync(join(SCHOOLS, id, 'profile.json'), 'utf8'));
}

const cdls = parseSchoolProfile(readPack('cdls-daher'));

/** A copy of the CDLS profile with one field replaced, for the refusals. */
function withField(path: readonly string[], value: unknown): unknown {
  const copy: unknown = structuredClone(cdls);
  let node = copy;
  for (const key of path.slice(0, -1)) {
    if (typeof node === 'object' && node !== null) node = (node as Record<string, unknown>)[key];
  }
  const last = path[path.length - 1];
  if (typeof node === 'object' && node !== null && last) (node as Record<string, unknown>)[last] = value;
  return copy;
}

describe('school packs', () => {
  it('finds the CDLS pack and the example', () => {
    expect(packs).toEqual(expect.arrayContaining(['cdls-daher', 'example']));
  });

  it.each(packs)('validates schools/%s/profile.json, whose id is its folder', (id) => {
    const profile = parseSchoolProfile(readPack(id), `schools/${id}/profile.json`);
    expect(profile.id).toBe(id);
  });

  it('flags the example as placeholder content, not CDLS', () => {
    expect(parseSchoolProfile(readPack('example')).placeholder).toBe(true);
    expect(cdls.placeholder).toBe(false);
  });
});

describe('schoolProfileProblems', () => {
  it('accepts the CDLS profile', () => {
    expect(schoolProfileProblems(cdls)).toEqual([]);
  });

  it('names each wrong field', () => {
    expect(schoolProfileProblems(withField(['timeZone'], 'Mars/Olympus'))).toEqual([
      'timeZone: fuseau IANA inconnu « Mars/Olympus » (Africa/Cairo)',
    ]);
    expect(schoolProfileProblems(withField(['id'], 'CDLS Daher'))[0]).toMatch(/^id:/);
    expect(schoolProfileProblems(withField(['loginEmailDomain'], 'pas un domaine'))[0]).toMatch(/^loginEmailDomain:/);
    expect(schoolProfileProblems(withField(['contacts', 'email'], 'secretariat'))[0]).toMatch(/^contacts\.email:/);
    expect(schoolProfileProblems(withField(['names', 'ar', 'full'], ''))[0]).toMatch(/^names\.ar\.full:/);
    expect(schoolProfileProblems(withField(['calendar', 'productName'], 'Collège'))[0]).toMatch(/ASCII/);
    expect(schoolProfileProblems(withField(['brand', 'colors'], { '--color-text': '#000000' }))[0]).toMatch(/jeton inconnu/);
  });

  it('refuses sections other than the platform codes, a default language other than French, unknown languages', () => {
    const one = withField(['sections'], [cdls.sections[0]]);
    expect(schoolProfileProblems(one)).toEqual([
      'sections: les codes doivent être exactement bac, nationale (docs/new-school.md, « Sections »)',
    ]);
    expect(schoolProfileProblems(withField(['defaultLanguage'], 'en'))[0]).toMatch(/^defaultLanguage:/);
    expect(schoolProfileProblems(withField(['languages'], ['fr', 'de']))[0]).toMatch(/^languages:/);
    expect(schoolProfileProblems(withField(['languages'], ['en']))).toContain('languages: doit contenir defaultLanguage');
  });

  it('refuses something that is not an object, and parseSchoolProfile lists every problem', () => {
    expect(schoolProfileProblems(null)[0]).toBe('profile: objet attendu');
    expect(() => parseSchoolProfile({ id: 'x' }, 'schools/x/profile.json')).toThrow(
      /Profil d’établissement invalide \(schools\/x\/profile\.json\) :\n- placeholder/,
    );
  });

  it('knows IANA zones and refuses bare abbreviations', () => {
    expect(isTimeZone('Africa/Cairo')).toBe(true);
    expect(isTimeZone('Europe/Paris')).toBe(true);
    expect(isTimeZone('UTC')).toBe(true);
    expect(isTimeZone('EET')).toBe(false);
    expect(isTimeZone('Nowhere/City')).toBe(false);
  });
});

describe('reading a profile', () => {
  it('gives the section names per language, the title and the example login', () => {
    expect(sectionLabels(cdls)).toEqual({ nationale: 'Bac nationale', bac: 'Bac français' });
    expect(sectionLabels(cdls, 'en').bac).toBe('French Bac');
    expect(schoolTitle(cdls)).toBe('Collège de la Salle — Daher');
    expect(loginExample(cdls)).toBe('prenom.nom@lasalle-daher.eg');
  });
});

describe('the school day in another time zone', () => {
  // 22:30 UTC on 31 December: already the new year in Cairo (UTC+2), still the old one in New York (UTC-5).
  const instant = new Date('2026-12-31T22:30:00Z');

  it('reads the date and the time in the zone it is given', () => {
    expect(dayInZone('Africa/Cairo', instant)).toBe('2027-01-01');
    expect(timeInZone('Africa/Cairo', instant)).toBe('00:30');
    expect(dayInZone('America/New_York', instant)).toBe('2026-12-31');
    expect(timeInZone('America/New_York', instant)).toBe('17:30');
    expect(dayInZone('Asia/Tokyo', instant)).toBe('2027-01-01');
  });

  it('measures offsets with summer time', () => {
    expect(zoneOffsetMinutes('Europe/Paris', Date.UTC(2026, 0, 15))).toBe(60);
    expect(zoneOffsetMinutes('Europe/Paris', Date.UTC(2026, 6, 15))).toBe(120);
    expect(zoneOffsetMinutes('Asia/Kolkata', Date.UTC(2026, 6, 15))).toBe(330);
  });
});

describe('vtimezone', () => {
  it('keeps the hand-written Cairo block', () => {
    const block = vtimezone('Africa/Cairo', 2025, 2027);
    expect(block[1]).toBe('TZID:Africa/Cairo');
    expect(block).toContain('RRULE:FREQ=YEARLY;BYMONTH=4;BYDAY=-1FR');
  });

  it('computes the changes of a zone with summer time, at the local time they happen', () => {
    const block = vtimezone('Europe/Paris', 2026, 2026);
    expect(block.slice(0, 3)).toEqual(['BEGIN:VTIMEZONE', 'TZID:Europe/Paris', 'X-LIC-LOCATION:Europe/Paris']);
    const text = block.join('\n');
    // 29 March 2026: 02:00 becomes 03:00; 25 October 2026: 03:00 becomes 02:00.
    expect(text).toContain('BEGIN:DAYLIGHT\nTZOFFSETFROM:+0100\nTZOFFSETTO:+0200\nDTSTART:20260329T020000\nEND:DAYLIGHT');
    expect(text).toContain('BEGIN:STANDARD\nTZOFFSETFROM:+0200\nTZOFFSETTO:+0100\nDTSTART:20261025T030000\nEND:STANDARD');
    expect(block[block.length - 1]).toBe('END:VTIMEZONE');
  });

  it('writes one STANDARD component for a zone without summer time, half hours included', () => {
    expect(vtimezone('Asia/Kolkata', 2026, 2027)).toEqual([
      'BEGIN:VTIMEZONE',
      'TZID:Asia/Kolkata',
      'X-LIC-LOCATION:Asia/Kolkata',
      'BEGIN:STANDARD',
      'TZOFFSETFROM:+0530',
      'TZOFFSETTO:+0530',
      'DTSTART:20260101T053000',
      'END:STANDARD',
      'END:VTIMEZONE',
    ]);
  });

  it('writes a feed in the school’s zone with its calendar ids', () => {
    const ics = toFeedIcs(
      [
        {
          uid: 'slot-s1-2026-10-04',
          kind: 'session',
          day: '2026-10-04',
          start: '08:30',
          end: '10:00',
          summary: 'Maths',
          location: '',
          description: '',
          updatedAt: '2026-10-01T08:00:00.000Z',
        },
      ],
      {
        name: 'École Exemple — Nadia',
        now: '2026-10-23T10:00:00.000Z',
        timeZone: 'Europe/Paris',
        calendar: { uidDomain: 'ecole-exemple', productName: 'Ecole Exemple' },
      },
    );
    expect(ics).toContain('PRODID:-//Ecole Exemple//Agenda//FR\r\n');
    expect(ics).toContain('X-WR-TIMEZONE:Europe/Paris\r\n');
    expect(ics).toContain('BEGIN:VTIMEZONE\r\nTZID:Europe/Paris\r\n');
    expect(ics).toContain('DTSTART;TZID=Europe/Paris:20261004T083000\r\n');
    expect(ics).toContain('UID:slot-s1-2026-10-04@ecole-exemple\r\n');
    expect(ics).not.toContain('Cairo');
  });
});
