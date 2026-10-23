import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { LogMailTransport } from './log-mail-transport.js';
import { MailService } from './mail.service.js';
import { SmtpMailTransport } from './smtp-mail-transport.js';

const ENV: Record<string, string> = {
  MAIL_FROM: 'Collège <no-reply@demo.cdls.test>',
  PUBLIC_WEB_URL: 'https://www.lasalle.test',
};

describe('MailService', () => {
  it('builds a French reset mail whose link points at the public web address', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const mail = new MailService({ send }, { get: (k: string) => ENV[k] } as ConfigService<never, true>);
    await mail.sendPasswordReset('eleve@demo.cdls.test', 'Léa <b>', 'tok-en_1', 60);
    const [message, from] = send.mock.calls[0] as [
      { to: string; text: string; html: string; subject: string },
      string,
    ];
    expect(from).toBe(ENV['MAIL_FROM']);
    expect(message.to).toBe('eleve@demo.cdls.test');
    expect(message.subject).toContain('mot de passe');
    expect(message.text).toContain('https://www.lasalle.test/connexion/reinitialiser?token=tok-en_1');
    expect(message.text).toContain('valable 1 heure');
    expect(message.html).toContain('Léa &lt;b&gt;');
  });
});

describe('LogMailTransport', () => {
  it('writes the mail to a file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cdls-mail-'));
    try {
      await new LogMailTransport(dir).send(
        { to: 'a@demo.cdls.test', subject: 'Sujet', text: 'Corps https://x.test/?token=1' },
        'from@x.test',
      );
      const [file] = await readdir(dir);
      expect(file).toMatch(/a@demo\.cdls\.test\.txt$/);
      const written = await readFile(join(dir, file!), 'utf8');
      expect(written).toContain('Subject: Sujet');
      expect(written).toContain('https://x.test/?token=1');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('SmtpMailTransport', () => {
  it('hands the message to nodemailer', async () => {
    const sendMail = vi.fn().mockResolvedValue({});
    await new SmtpMailTransport({ host: 'smtp.test', port: 587, secure: false }, { sendMail }).send(
      { to: 'a@x.test', subject: 'S', text: 'T', html: '<p>T</p>' },
      'from@x.test',
    );
    expect(sendMail).toHaveBeenCalledWith({
      from: 'from@x.test',
      to: 'a@x.test',
      subject: 'S',
      text: 'T',
      html: '<p>T</p>',
    });
  });
});
