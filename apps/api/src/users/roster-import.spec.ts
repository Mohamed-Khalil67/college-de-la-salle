import {
  checkRoster,
  columnName,
  headerProblems,
  identityKey,
  type RosterContext,
} from './roster-import.js';

const context = (overrides: Partial<RosterContext> = {}): RosterContext => ({
  role: 'student',
  domain: 'demo.cdls.test',
  classes: new Map([
    ['bac/seconde', { id: 'c-seconde', label: 'Seconde' }],
    ['nationale/secondaire-1', { id: 'c-s1', label: '1re secondaire' }],
  ]),
  takenEmails: new Set(['nour.saad@demo.cdls.test']),
  existingByNumber: new Map([['CDLS-1', 'nour.saad@demo.cdls.test']]),
  existingByIdentity: new Map(),
  createAnyway: new Set<number>(),
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
        student({ studentNumber: 'A 1' }),
        student({ birthDate: '31/02/2010' }),
        student({ firstName: 'محمد' }),
        student({ studentNumber: 'X-2' }),
        student({ studentNumber: 'X-2' }),
      ],
      context(),
    );
    expect(errors.map((e) => e.line)).toEqual([2, 3, 4, 5, 6, 7, 9]);
    expect(errors[6]!.message).toBe('matricule en double dans le fichier : X-2');
    expect(rows).toHaveLength(1);
    // A refused line does not take a number from the valid ones.
    expect(rows[0]!.email).toBe('nour.saad2@demo.cdls.test');
  });

  it('marks the homonym number with its reason in the preview', () => {
    const { rows } = checkRoster([student(), student({ firstName: 'Omar' }), student()], context());
    expect(rows.map((r) => [r.email, r.emailNumber, r.emailNote])).toEqual([
      ['nour.saad2@demo.cdls.test', 2, 'car 1 homonyme'],
      ['omar.saad@demo.cdls.test', 1, null],
      ['nour.saad3@demo.cdls.test', 3, 'car 2 homonymes'],
    ]);
  });

  it('keeps a student already in the school (same student number): no new e-mail, no renumbering', () => {
    const { rows, errors } = checkRoster(
      [student({ studentNumber: 'CDLS-1' }), student({ studentNumber: 'CDLS-9' })],
      context(),
    );
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({
      alreadyImported: true,
      email: 'nour.saad@demo.cdls.test',
      emailNumber: 0,
      emailNote: null,
    });
    // The newcomer is numbered after the existing address, as if the first one were a new account.
    expect(rows[1]).toMatchObject({ alreadyImported: false, email: 'nour.saad2@demo.cdls.test' });
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

describe('checkRoster: the same person again', () => {
  const known = identityKey('student', 'Nour', 'Saad', 'bac', 'c-seconde')!;
  const withKnown = (extra: Partial<RosterContext> = {}) =>
    context({ existingByIdentity: new Map([[known, 'nour.saad@demo.cdls.test']]), ...extra });

  it('marks a line without student number whose name, section and class exist as already present', () => {
    const { rows } = checkRoster([student({ firstName: 'NOUR', lastName: 'saad' })], withKnown());
    expect(rows[0]).toMatchObject({
      alreadyImported: true,
      matchedBy: 'name',
      createAnyway: false,
      email: 'nour.saad@demo.cdls.test',
    });
  });

  it('keeps a student of another class, or with another student number, as a new person', () => {
    const other = checkRoster([student({ class: 'seconde', section: 'bac' })], context());
    expect(other.rows[0]!.alreadyImported).toBe(false);
    const elsewhere = checkRoster(
      [student({ section: 'nationale', class: 'secondaire-1' })],
      withKnown(),
    );
    expect(elsewhere.rows[0]!.alreadyImported).toBe(false);
    const numbered = checkRoster([student({ studentNumber: 'NEW-9' })], withKnown());
    expect(numbered.rows[0]).toMatchObject({ alreadyImported: false, matchedBy: null });
  });

  it('creates a genuine homonym only on the explicit per-line choice, with the next number', () => {
    const taken = new Set(['nour.saad@demo.cdls.test']);
    const { rows } = checkRoster(
      [student(), student({ firstName: 'Nour' })],
      withKnown({ takenEmails: taken, createAnyway: new Set([3]) }),
    );
    expect(rows[0]).toMatchObject({ alreadyImported: true, matchedBy: 'name' });
    expect(rows[1]).toMatchObject({
      alreadyImported: false,
      createAnyway: true,
      email: 'nour.saad2@demo.cdls.test',
      emailNumber: 2,
    });
  });

  it('matches teachers by name alone and reports the real line numbers', () => {
    const key = identityKey('teacher', 'Anne', 'Lefèvre', null, null)!;
    const { rows } = checkRoster(
      [{ lastName: 'LEFEVRE', firstName: 'anne' }],
      context({
        role: 'teacher',
        existingByIdentity: new Map([[key, 'anne.lefevre@demo.cdls.test']]),
      }),
      [7],
    );
    expect(rows[0]).toMatchObject({ line: 7, alreadyImported: true, matchedBy: 'name' });
  });
});
