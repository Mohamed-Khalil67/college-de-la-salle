import {
  assignSchoolEmails,
  emailNamePart,
  parseRosterDate,
  passwordProblems,
  schoolEmailLocalPart,
} from './accounts.js';

describe('emailNamePart', () => {
  it('lower-cases and removes accents', () => {
    expect(emailNamePart('Hélène')).toBe('helene');
    expect(emailNamePart('LEFÈVRE')).toBe('lefevre');
    expect(emailNamePart('Çağla Ñúñez')).toBe('cagla-nunez');
  });

  it('turns spaces and apostrophes into hyphens', () => {
    expect(emailNamePart('Abd El Rahman')).toBe('abd-el-rahman');
    expect(emailNamePart("d'Artagnan")).toBe('d-artagnan');
    expect(emailNamePart('O’Neill')).toBe('o-neill');
    expect(emailNamePart('Marie-Hélène')).toBe('marie-helene');
  });

  it('drops other characters and trims hyphens', () => {
    expect(emailNamePart('  Jean -- Paul. ')).toBe('jean-paul');
    expect(emailNamePart('Œdipe Straße')).toBe('oedipe-strasse');
    expect(emailNamePart('محمد')).toBe('');
  });
});

describe('schoolEmailLocalPart', () => {
  it('is prenom.nom', () => {
    expect(schoolEmailLocalPart('Mariam', 'El Sayed')).toBe('mariam.el-sayed');
  });

  it('is null when a name has no usable letter', () => {
    expect(schoolEmailLocalPart('محمد', 'Hassan')).toBeNull();
    expect(schoolEmailLocalPart('Omar', ' ')).toBeNull();
  });
});

describe('assignSchoolEmails', () => {
  const domain = 'demo.cdls.test';

  it('builds prenom.nom@domain', () => {
    expect(assignSchoolEmails([{ firstName: 'Youssef', lastName: 'Ibrahim' }], domain)).toEqual([
      'youssef.ibrahim@demo.cdls.test',
    ]);
  });

  it('numbers collisions within the list and with existing accounts', () => {
    const people = [
      { firstName: 'Nour', lastName: 'Saad' },
      { firstName: 'Nour', lastName: 'Saad' },
      { firstName: 'Nôur', lastName: 'SAAD' },
      { firstName: 'Omar', lastName: 'Saad' },
    ];
    expect(assignSchoolEmails(people, domain, ['Nour.Saad@demo.cdls.test'])).toEqual([
      'nour.saad2@demo.cdls.test',
      'nour.saad3@demo.cdls.test',
      'nour.saad4@demo.cdls.test',
      'omar.saad@demo.cdls.test',
    ]);
  });

  it('skips numbers already taken', () => {
    expect(
      assignSchoolEmails([{ firstName: 'Ali', lastName: 'Zaki' }], domain, [
        'ali.zaki@demo.cdls.test',
        'ali.zaki2@demo.cdls.test',
      ]),
    ).toEqual(['ali.zaki3@demo.cdls.test']);
  });

  it('gives null for names without usable letters', () => {
    expect(assignSchoolEmails([{ firstName: 'علي', lastName: 'زكي' }], domain)).toEqual([null]);
  });
});

describe('passwordProblems', () => {
  const email = 'mariam.saad@demo.cdls.test';

  it('accepts 10 characters or more', () => {
    expect(passwordProblems('Cedre-du-Liban', email)).toEqual([]);
    expect(passwordProblems('abcdefghij', email)).toEqual([]);
  });

  it('refuses short passwords', () => {
    expect(passwordProblems('abcdefghi', email)).toEqual([
      'Le mot de passe doit compter au moins 10 caractères.',
    ]);
  });

  it('refuses the e-mail or its local part, whatever the case', () => {
    expect(passwordProblems('Mariam.Saad@demo.cdls.test', email)).toEqual([
      'Le mot de passe ne doit pas être votre adresse e-mail.',
    ]);
    expect(passwordProblems('MARIAM.SAAD', email)).toEqual([
      'Le mot de passe ne doit pas être votre adresse e-mail.',
    ]);
  });

  it('refuses very long passwords', () => {
    expect(passwordProblems('a'.repeat(201), email)).toHaveLength(1);
  });
});

describe('parseRosterDate', () => {
  it('reads ISO and French dates', () => {
    expect(parseRosterDate('2010-03-15')).toBe('2010-03-15');
    expect(parseRosterDate('5/3/2010')).toBe('2010-03-05');
    expect(parseRosterDate(' 15/03/2010 ')).toBe('2010-03-15');
  });

  it('refuses impossible days and other formats', () => {
    expect(parseRosterDate('2010-02-30')).toBeNull();
    expect(parseRosterDate('31/04/2010')).toBeNull();
    expect(parseRosterDate('03-15-2010')).toBeNull();
    expect(parseRosterDate('')).toBeNull();
  });
});
