import { describe, expect, it } from 'vitest';
import {
  PASSWORD_ALPHABET,
  classOptionLabel,
  createdAccountsCsv,
  csvCell,
  formatAverage,
  formatDay,
  formatLastLogin,
  generatePassword,
  groupBySection,
  importErrors,
  importTemplate,
  isYearLabel,
  plural,
  shownError,
  userStatus,
} from './admin-format';

describe('userStatus', () => {
  it('says when an account is disabled, never used or active', () => {
    const login = '2026-10-01T08:00:00Z';
    expect(userStatus({ status: 'disabled', mustChangePassword: false, lastLoginAt: login })).toEqual({ label: 'Désactivé', tone: 'neutral' });
    expect(userStatus({ status: 'archived', mustChangePassword: true, lastLoginAt: null })).toEqual({ label: 'Archivé', tone: 'neutral' });
    expect(userStatus({ status: 'active', mustChangePassword: true, lastLoginAt: login }).label).toBe('Premier accès à faire');
    expect(userStatus({ status: 'active', mustChangePassword: false, lastLoginAt: null }).label).toBe('Jamais connecté');
    expect(userStatus({ status: 'active', mustChangePassword: false, lastLoginAt: login }).tone).toBe('success');
  });
});

describe('formatLastLogin', () => {
  const now = new Date('2026-10-20T10:00:00Z'); // 13 h in Cairo
  it('reads today, yesterday and older days in Cairo time', () => {
    expect(formatLastLogin(null, now)).toBe('Jamais');
    expect(formatLastLogin('2026-10-20T06:14:00Z', now)).toBe('Aujourd’hui, 9 h 14');
    expect(formatLastLogin('2026-10-19T12:00:00Z', now)).toBe('Hier');
    expect(formatLastLogin('2026-10-18T12:00:00Z', now)).toBe('18 octobre');
    expect(formatLastLogin('2025-06-02T12:00:00Z', now)).toBe('2 juin 2025');
  });
});

describe('formatDay and formatAverage', () => {
  it('writes dates and averages the French way', () => {
    expect(formatDay('2026-09-01')).toBe('1 septembre 2026');
    expect(formatDay('n/a')).toBe('n/a');
    expect(formatAverage(12.456)).toBe('12,5');
    expect(formatAverage(null)).toBe('—');
    expect(plural(1, 'élève', 'élèves')).toBe('1 élève');
    expect(plural(0, 'élève', 'élèves')).toBe('0 élève');
    expect(plural(3, 'élève', 'élèves')).toBe('3 élèves');
  });
});

describe('groupBySection', () => {
  it('keeps the API order and labels each section', () => {
    const groups = groupBySection([
      { sectionCode: 'nationale' as const, id: 'a' },
      { sectionCode: 'bac' as const, id: 'b' },
      { sectionCode: 'nationale' as const, id: 'c' },
    ]);
    expect(groups.map((g) => [g.label, g.items.map((i) => i.id)])).toEqual([
      ['Bac nationale', ['a', 'c']],
      ['Bac français', ['b']],
    ]);
    expect(classOptionLabel({ label: 'Seconde', sectionCode: 'bac' })).toBe('Seconde (Bac français)');
  });
});

describe('shownError', () => {
  it('waits until the field was touched', () => {
    const errors = () => [{ message: 'Saisissez le nom.' }];
    expect(shownError({ touched: () => false, errors })).toBeNull();
    expect(shownError({ touched: () => true, errors })).toBe('Saisissez le nom.');
    expect(shownError({ touched: () => true, errors: () => [] })).toBeNull();
  });
});

describe('importErrors', () => {
  it('reads the per-line errors of a refused import', () => {
    const error = { status: 400, error: { message: 'Import refusé', errors: [{ line: 3, message: 'e-mail invalide' }, { bad: 1 }] } };
    expect(importErrors(error)).toEqual([{ line: 3, message: 'e-mail invalide' }]);
    expect(importErrors({ error: { message: 'CSV illisible' } })).toBeNull();
    expect(importErrors(null)).toBeNull();
  });
});

describe('createdAccountsCsv', () => {
  it('escapes cells and labels roles in French', () => {
    const csv = createdAccountsCsv([
      { email: 'a@b.eg', role: 'student', firstName: 'Mariam', lastName: 'Saad', temporaryPassword: 'x,"y' },
    ]);
    expect(csv).toBe('nom,prenom,email,role,motDePasseTemporaire\nSaad,Mariam,a@b.eg,Élève,"x,""y"\n');
  });
});

describe('csvCell', () => {
  it('neutralises spreadsheet formulas and quotes special characters', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvCell('-abc')).toBe("'-abc");
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('@sum')).toBe("'@sum");
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a,b')).toBe('"a,b"');
  });
});

describe('importTemplate', () => {
  it('has the roster header of each role and no e-mail column', () => {
    expect(importTemplate('student').split('\n')[0]).toBe('lastName,firstName,section,class,studentNumber,birthDate');
    expect(importTemplate('teacher').split('\n')[0]).toBe('lastName,firstName');
  });
});

describe('generatePassword', () => {
  it('uses the alphabet only and rejects biased bytes', () => {
    let calls = 0;
    const bytes = (size: number) => {
      calls++;
      return Uint8Array.from({ length: size }, (_, i) => (calls === 1 ? 255 : i));
    };
    const password = generatePassword(bytes, 10);
    expect(password).toHaveLength(10);
    expect(calls).toBe(2);
    expect([...password].every((c) => PASSWORD_ALPHABET.includes(c))).toBe(true);
    expect(password.startsWith('ABCDEFGHJK')).toBe(true);
  });
});

describe('isYearLabel', () => {
  it('accepts two consecutive years', () => {
    expect(isYearLabel('2027-2028')).toBe(true);
    expect(isYearLabel('2027-2029')).toBe(false);
    expect(isYearLabel('2027')).toBe(false);
  });
});
