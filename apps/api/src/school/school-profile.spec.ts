import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ConfigService } from '@nestjs/config';
import { validateEnv } from '../config/env.validation.js';
import { MailService } from '../mail/mail.service.js';
import { activeSchool, DEFAULT_SCHOOL, loadSchoolProfile, schoolsDir } from './school-profile.js';

const BASE_ENV = {
  DATABASE_URL: 'postgresql://cdls:x@localhost:5433/cdls_test',
  JWT_ACCESS_SECRET: 'a'.repeat(40),
  JWT_REFRESH_SECRET: 'b'.repeat(40),
};

describe('school profile of the install', () => {
  it('finds the packs of the repository and reads CDLS by default', () => {
    const dir = schoolsDir();
    expect(loadSchoolProfile(DEFAULT_SCHOOL, dir).timeZone).toBe('Africa/Cairo');
    expect(loadSchoolProfile('example', dir).names.fr.full).toBe('École Exemple');
    expect(activeSchool().id).toBe(process.env['SCHOOL'] || DEFAULT_SCHOOL);
  });

  it('names the known packs when SCHOOL is unknown', () => {
    expect(() => loadSchoolProfile('nowhere', schoolsDir())).toThrow(/Known school packs: .*cdls-daher.*example/);
  });

  it('refuses a profile whose id is not its folder, or that is not valid', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cdls-schools-'));
    try {
      const copy = { ...loadSchoolProfile('example', schoolsDir()), id: 'other' };
      await mkdir(join(dir, 'wrong'));
      await writeFile(join(dir, 'wrong', 'profile.json'), JSON.stringify(copy));
      expect(() => loadSchoolProfile('wrong', dir)).toThrow(/says its id is « other »/);
      await mkdir(join(dir, 'broken'));
      await writeFile(join(dir, 'broken', 'profile.json'), JSON.stringify({ ...copy, id: 'broken', timeZone: 'Cairo' }));
      expect(() => loadSchoolProfile('broken', dir)).toThrow(/timeZone: fuseau IANA inconnu/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('stops the API at start on an unknown SCHOOL, and signs mails with the school name by default', () => {
    expect(() => validateEnv({ ...BASE_ENV, SCHOOL: 'nowhere' })).toThrow(/SCHOOL=nowhere/);
    expect(() => validateEnv({ ...BASE_ENV, SCHOOL: 'Not A Pack' })).toThrow(/SCHOOL must be a pack folder name/);
    expect(validateEnv({ ...BASE_ENV, SCHOOL: 'example' }).MAIL_FROM).toBe('École Exemple <no-reply@demo.cdls.test>');
    expect(validateEnv({ ...BASE_ENV, MAIL_FROM: 'X <x@y.test>' }).MAIL_FROM).toBe('X <x@y.test>');
  });

  it('writes the reset mail with the name of the school it serves', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const config = { get: (k: string) => (k === 'PUBLIC_WEB_URL' ? 'https://ecole.test' : 'from') } as ConfigService<never, true>;
    const mail = new MailService({ send }, config, loadSchoolProfile('example', schoolsDir()));
    await mail.sendPasswordReset('a@ecole.test', 'Léa', 'tok', 60);
    const [message] = send.mock.calls[0] as [{ text: string; html: string }];
    expect(message.text).toContain('le mot de passe de votre compte de l’École Exemple.');
    expect(message.text.trim().endsWith('École Exemple')).toBe(true);
    expect(message.html).not.toContain('Salle');
  });
});
