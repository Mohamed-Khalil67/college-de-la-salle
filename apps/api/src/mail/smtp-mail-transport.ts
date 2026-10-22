import { createTransport, type Transporter } from 'nodemailer';
import type { MailMessage, MailTransport } from './mail-transport.js';

export interface SmtpSettings {
  readonly host: string;
  readonly port: number;
  readonly secure: boolean;
  readonly user?: string;
  readonly password?: string;
}

/** Sends through an SMTP server (MAIL_TRANSPORT=smtp). */
export class SmtpMailTransport implements MailTransport {
  private readonly transporter: Pick<Transporter, 'sendMail'>;

  constructor(settings: SmtpSettings, transporter?: Pick<Transporter, 'sendMail'>) {
    this.transporter =
      transporter ??
      createTransport({
        host: settings.host,
        port: settings.port,
        secure: settings.secure,
        ...(settings.user ? { auth: { user: settings.user, pass: settings.password ?? '' } } : {}),
      });
  }

  async send(message: MailMessage, from: string): Promise<void> {
    await this.transporter.sendMail({
      from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      ...(message.html ? { html: message.html } : {}),
    });
  }
}
