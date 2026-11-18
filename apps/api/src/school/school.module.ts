import { Global, Inject, Logger, Module, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SchoolProfile } from '@cdls/shared';
import type { Env } from '../config/env.validation.js';
import { activeSchool } from './school-profile.js';

/** Injection token of the install's SchoolProfile (names for mails and report cards, calendar ids). */
export const SCHOOL_PROFILE = Symbol('SCHOOL_PROFILE');

/** Provides the school profile read at start (`SCHOOL`, validated by env.validation.ts). */
@Global()
@Module({
  providers: [{ provide: SCHOOL_PROFILE, useFactory: (): SchoolProfile => activeSchool() }],
  exports: [SCHOOL_PROFILE],
})
export class SchoolModule implements OnModuleInit {
  readonly #logger = new Logger('School');

  constructor(
    @Inject(SCHOOL_PROFILE) private readonly school: SchoolProfile,
    private readonly config: ConfigService<Env, true>,
  ) {}

  onModuleInit(): void {
    const domain = this.config.get('SCHOOL_EMAIL_DOMAIN', { infer: true });
    this.#logger.log(`Serving ${this.school.names.fr.full} (${this.school.id}), time zone ${this.school.timeZone}.`);
    // Not an error: the profile's domain is only the example shown in help texts, the env one makes the logins.
    if (this.config.get('NODE_ENV', { infer: true }) === 'production' && domain !== this.school.loginEmailDomain) {
      this.#logger.warn(
        `SCHOOL_EMAIL_DOMAIN (${domain}) differs from loginEmailDomain of schools/${this.school.id}/profile.json ` +
          `(${this.school.loginEmailDomain}): the help texts show the wrong example. Update the profile and rebuild the web image.`,
      );
    }
  }
}
