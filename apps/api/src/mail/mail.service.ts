import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { digestText, type NotificationText, type SchoolProfile } from '@cdls/shared';
import type { Env } from '../config/env.validation.js';
import { SCHOOL_PROFILE } from '../school/school.module.js';
import { MAIL_TRANSPORT, type MailTransport } from './mail-transport.js';

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const escapeHtml = (text: string) => text.replace(/[&<>"]/g, (c) => ESCAPES[c]!);

/** Composes the mails of the platform (in French) and hands them to the configured transport. */
@Injectable()
export class MailService {
  private readonly from: string;
  private readonly webUrl: string;

  constructor(
    @Inject(MAIL_TRANSPORT) private readonly transport: MailTransport,
    config: ConfigService<Env, true>,
    @Inject(SCHOOL_PROFILE) private readonly school: SchoolProfile,
  ) {
    this.from = config.get('MAIL_FROM', { infer: true });
    this.webUrl = config.get('PUBLIC_WEB_URL', { infer: true });
  }

  /** The page that takes the token of a reset mail. */
  resetLink(token: string): string {
    return `${this.webUrl}/connexion/reinitialiser?token=${encodeURIComponent(token)}`;
  }

  async sendPasswordReset(
    to: string,
    firstName: string,
    token: string,
    validityMinutes: number,
  ): Promise<void> {
    const link = this.resetLink(token);
    const validity =
      validityMinutes % 60 === 0
        ? `${validityMinutes / 60} heure${validityMinutes === 60 ? '' : 's'}`
        : `${validityMinutes} minutes`;
    const text = [
      `Bonjour ${firstName},`,
      '',
      `Vous avez demandé à réinitialiser le mot de passe de votre compte ${this.school.names.fr.of}.`,
      `Ouvrez ce lien pour en choisir un nouveau (valable ${validity}, utilisable une seule fois) :`,
      '',
      link,
      '',
      'Si vous n’êtes pas à l’origine de cette demande, ignorez ce message : votre mot de passe actuel reste valable.',
      '',
      this.school.names.fr.full,
    ].join('\n');
    const html = [
      `<p>Bonjour ${escapeHtml(firstName)},</p>`,
      `<p>Vous avez demandé à réinitialiser le mot de passe de votre compte ${escapeHtml(this.school.names.fr.of)}.</p>`,
      `<p><a href="${escapeHtml(link)}">Choisir un nouveau mot de passe</a> (lien valable ${validity}, utilisable une seule fois).</p>`,
      '<p>Si vous n’êtes pas à l’origine de cette demande, ignorez ce message : votre mot de passe actuel reste valable.</p>',
      `<p>${escapeHtml(this.school.names.fr.full)}</p>`,
    ].join('\n');
    await this.transport.send(
      { to, subject: 'Réinitialisation de votre mot de passe', text, html },
      this.from,
    );
  }

  /**
   * The digest of a user's new notifications (one mail for all of them). `page` is the notifications
   * page of their space, a path such as `/eleve/notifications`.
   */
  async sendNotificationDigest(
    to: string,
    firstName: string,
    items: readonly NotificationText[],
    page: string,
  ): Promise<void> {
    const link = `${this.webUrl}${page}`;
    const { subject, text } = digestText(firstName, items, link, this.school.names.fr.full);
    const html = text
      .split('\n')
      .filter((line) => line !== '')
      .map((line) =>
        line === `Tout voir : ${link}`
          ? `<p><a href="${escapeHtml(link)}">Tout voir</a></p>`
          : `<p>${escapeHtml(line)}</p>`,
      )
      .join('\n');
    await this.transport.send({ to, subject, text, html }, this.from);
  }
}
