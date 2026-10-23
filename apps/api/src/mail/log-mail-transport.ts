import { Logger } from '@nestjs/common';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { MailMessage, MailTransport } from './mail-transport.js';

/** Where the log transport drops mails (gitignored); relative to the API's working directory. */
export const DEV_MAIL_DIR = resolve(process.cwd(), '.dev-mail');

/** Development transport: nothing is sent; the mail (links included) goes to the API log and to a file. */
export class LogMailTransport implements MailTransport {
  private readonly logger = new Logger('Mail');

  constructor(private readonly directory = DEV_MAIL_DIR) {}

  async send(message: MailMessage, from: string): Promise<void> {
    const body = `From: ${from}\nTo: ${message.to}\nSubject: ${message.subject}\n\n${message.text}\n`;
    this.logger.log(`Mail (log transport, not sent)\n${body}`);
    await mkdir(this.directory, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const recipient = message.to.replace(/[^a-z0-9@._-]/gi, '_');
    await writeFile(join(this.directory, `${stamp}_${recipient}.txt`), body, 'utf8');
  }
}
