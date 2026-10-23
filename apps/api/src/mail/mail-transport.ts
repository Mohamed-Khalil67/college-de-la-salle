/** One outgoing mail. `text` is always present; `html` is optional. */
export interface MailMessage {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html?: string;
}

/** How mail leaves the API. Chosen by MAIL_TRANSPORT (see MailModule); tests swap in their own. */
export interface MailTransport {
  send(message: MailMessage, from: string): Promise<void>;
}

export const MAIL_TRANSPORT = Symbol('MAIL_TRANSPORT');
