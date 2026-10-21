import { checkRoster, columnName, headerProblems, type RosterContext } from './roster-import.js';

const context = (overrides: Partial<RosterContext> = {}): RosterContext => ({
  role: 'student',
  domain: 'demo.cdls.test',
  classes: new Map([
    ['bac/seconde', { id: 'c-seconde', label: 'Seconde' }],
    ['nationale/secondaire-1', { id: 'c-s1', label: '1re secondaire' }],
  ]),
  takenEmails: new Set(['nour.saad@demo.cdls.test']),
  takenNumbers: new Set(['CDLS-1']),
  ...overrides,
});

const student = (overrides: Record<string, string> = {}) => ({
  lastName: 'Saad',
  firstName: 'Nour',
  section: 'bac',
  class: 'seconde',
  studentNumber: '',
  birthDate: '',
  ...overrides,
});

describe('columnName', () => {
  it('accepts the contract names and French headings', () => {
    expect(columnName('lastName')).toBe('lastName');
    expect(columnName('Prénom')).toBe('firstName');
    expect(columnName('Date de naissance')).toBe('birthDate');
    expect(columnName('Classe')).toBe('class');
    expect(columnName('email')).toBeNull();
  });
});

describe('headerProblems', () => {
  it('needs the student columns', () => {
    expect(headerProblems(['lastName', 'firstName', 'section', 'class'], 'student')).toEqual([]);
    expect(headerProblems(['lastName', 'firstName'], 'student')).toEqual([
      'colonne obligatoire manquante : section',
      'colonne obligatoire manquante : class',
    ]);
  });

  it('refuses unknown and repeated columns (the old e-mail format among them)', () => {
    expect(headerProblems(['email', 'lastName', 'firstName', 'nom'], 'teacher')).toEqual([
      'colonne inconnue « email »',
      'colonne en double « nom »',
    ]);
    expect(headerProblems(['lastName', 'firstName', 'section'], 'teacher')).toEqual([
      'colonne inconnue « section »',
    ]);
  });
});

describe('checkRoster', () => {
  it('builds the e-mails, numbered after existing accounts and earlier lines', () => {
    const { rows, errors } = checkRoster(
      [student(), student({ firstName: 'Nôur' }), student({ firstName: 'Omar', birthDate: '15/03/2010' })],
      context(),
    );
    expect(errors).toEqual([]);
    expect(rows.map((r) => r.email)).toEqual([
      'nour.saad2@demo.cdls.test',
      'nour.saad3@demo.cdls.test',
      'omar.saad@demo.cdls.test',
    ]);
    expect(rows[2]).toMatchObject({
      line: 4,
      sectionCode: 'bac',
      classId: 'c-seconde',
      classLabel: 'Seconde',
      birthDate: '2010-03-15',
    });
  });

  it('reports every invalid line with its number', () => {
    const { rows, errors } = checkRoster(
      [
        student({ firstName: '' }),
        student({ section: 'lycee' }),
        student({ class: 'terminale' }),
        student({ studentNumber: 'CDLS-1' }),
        student({ studentNumber: 'A 1' }),
        student({ birthDate: '31/02/2010' }),
        student({ firstName: 'محمد' }),
        student({ studentNumber: 'X-2' }),
        student({ studentNumber: 'X-2' }),
      ],
      context(),
    );
    expect(errors.map((e) => e.line)).toEqual([2, 3, 4, 5, 6, 7, 8, 10]);
    expect(errors[3]!.message).toBe('matricule déjà utilisé : CDLS-1');
    expect(rows).toHaveLength(1);
    // A refused line does not take a number from the valid ones.
    expect(rows[0]!.email).toBe('nour.saad2@demo.cdls.test');
  });

  it('accepts section and class codes in any case', () => {
    const { errors } = checkRoster([student({ section: 'BAC', class: 'Seconde' })], context());
    expect(errors).toEqual([]);
  });

  it('imports teachers from names only', () => {
    const { rows, errors } = checkRoster(
      [{ lastName: 'Lefèvre', firstName: 'Marc' }],
      context({ role: 'teacher' }),
    );
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({ email: 'marc.lefevre@demo.cdls.test', classId: null });
  });
});
