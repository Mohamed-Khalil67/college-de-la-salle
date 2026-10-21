import { assignSchoolEmails, describeSchoolEmails, emailNumberReason } from './accounts.js';

const domain = 'demo.cdls.test';
const mohamed = { firstName: 'Mohamed', lastName: 'Adel' };

describe('homonyms in generated e-mails', () => {
  it('gives the plain address when there is no collision', () => {
    expect(describeSchoolEmails([mohamed], domain)).toEqual([{ email: 'mohamed.adel@demo.cdls.test', number: 1 }]);
  });

  it('numbers two or three homonyms of the same file in order', () => {
    expect(describeSchoolEmails([mohamed, mohamed, mohamed], domain).map((e) => e?.email)).toEqual([
      'mohamed.adel@demo.cdls.test',
      'mohamed.adel2@demo.cdls.test',
      'mohamed.adel3@demo.cdls.test',
    ]);
  });

  it('counts one in the database plus one in the file', () => {
    const result = describeSchoolEmails([mohamed, mohamed], domain, ['mohamed.adel@demo.cdls.test']);
    expect(result.map((e) => [e?.email, e?.number])).toEqual([
      ['mohamed.adel2@demo.cdls.test', 2],
      ['mohamed.adel3@demo.cdls.test', 3],
    ]);
  });

  it('compares after removing accents, spaces and apostrophes, whatever the case', () => {
    const result = assignSchoolEmails(
      [
        { firstName: 'Adèle', lastName: 'Ben Youssef' },
        { firstName: 'adele', lastName: 'ben-youssef' },
        { firstName: 'ADELE', lastName: "Ben'Youssef" },
      ],
      domain,
      ['Other.Person@Demo.CDLS.test'],
    );
    expect(result).toEqual([
      'adele.ben-youssef@demo.cdls.test',
      'adele.ben-youssef2@demo.cdls.test',
      'adele.ben-youssef3@demo.cdls.test',
    ]);
    expect(assignSchoolEmails([mohamed], domain, ['MOHAMED.ADEL@DEMO.CDLS.TEST'])).toEqual([
      'mohamed.adel2@demo.cdls.test',
    ]);
  });

  it('keeps every address, number included, within the 64-character local part', () => {
    const long = {
      firstName: 'Mohamed-Abdelrahman-Ibrahim-Mahmoud',
      lastName: 'El-Sayed-Hassan-Mahmoud-Abdelhamid-Fahmy',
    };
    const emails = assignSchoolEmails(
      Array.from({ length: 12 }, () => long),
      domain,
    );
    for (const email of emails) expect(email!.split('@')[0]!.length).toBeLessThanOrEqual(64);
    expect(new Set(emails).size).toBe(12);
  });

  it("never renumbers: a second import only numbers the newcomers after the first import's addresses", () => {
    const first = assignSchoolEmails([mohamed, mohamed], domain);
    const second = assignSchoolEmails([mohamed], domain, first.filter((e): e is string => !!e));
    expect(first).toEqual(['mohamed.adel@demo.cdls.test', 'mohamed.adel2@demo.cdls.test']);
    expect(second).toEqual(['mohamed.adel3@demo.cdls.test']);
  });

  it('explains the number for the preview', () => {
    expect(emailNumberReason(1)).toBeNull();
    expect(emailNumberReason(2)).toBe('car 1 homonyme');
    expect(emailNumberReason(3)).toBe('car 2 homonymes');
  });
});
