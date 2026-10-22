import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.validation.js';
import { LogMailTransport } from './log-mail-transport.js';
import { MAIL_TRANSPORT, type MailTransport } from './mail-transport.js';
import { MailService } from './mail.service.js';
import { SmtpMailTransport } from './smtp-mail-transport.js';

@Global()
@Module({
  providers: [
    {
      provide: MAIL_TRANSPORT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): MailTransport =>
        config.get('MAIL_TRANSPORT', { infer: true }) === 'smtp'
          ? new SmtpMailTransport({
              host: config.get('SMTP_HOST', { infer: true })!,
              port: config.get('SMTP_PORT', { infer: true }),
              secure: config.get('SMTP_SECURE', { infer: true }),
              user: config.get('SMTP_USER', { infer: true }) || undefined,
              password: config.get('SMTP_PASSWORD', { infer: true }) || undefined,
            })
          : new LogMailTransport(),
    },
    MailService,
  ],
  exports: [MailService],
})
export class MailModule {}
