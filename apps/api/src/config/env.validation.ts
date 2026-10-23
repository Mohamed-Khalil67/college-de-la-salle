import { plainToInstance, Transform } from 'class-transformer';
import {
  IsIn,
  IsFQDN,
  IsBoolean,
  IsOptional,
  IsUrl,
  IsInt,
  IsNotEmpty,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';
import { DURATION } from '../common/duration.js';

const PLACEHOLDER = /^replace-with-/;
/** The demo domain of the seed and the tests; production must set the school's own. */
export const DEMO_EMAIL_DOMAIN = 'demo.cdls.test';

/** Every environment variable the API reads. Validated once at startup; the app refuses to boot otherwise. */
export class Env {
  @IsIn(['development', 'test', 'production'])
  NODE_ENV: 'development' | 'test' | 'production' = 'development';

  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 3000;

  @IsString()
  @Matches(/^postgres(ql)?:\/\//, {
    message: 'DATABASE_URL must be a postgresql:// connection string',
  })
  DATABASE_URL: string;

  /** Comma-separated origins. */
  @IsString()
  @IsNotEmpty()
  CORS_ORIGIN = 'http://localhost:4200';

  @IsString()
  @MinLength(32)
  JWT_ACCESS_SECRET: string;

  @IsString()
  @MinLength(32)
  JWT_REFRESH_SECRET: string;

  @Matches(DURATION, { message: 'JWT_ACCESS_TTL must look like 15m, 1h' })
  JWT_ACCESS_TTL = '15m';

  @Matches(DURATION, { message: 'JWT_REFRESH_TTL must look like 7d, 12h' })
  JWT_REFRESH_TTL = '7d';

  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1000)
  THROTTLE_TTL_MS = 60_000;

  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  THROTTLE_LIMIT = 120;

  /** Sign-in attempts per minute and client. Keep the default in production; raise it locally for e2e runs. */
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  LOGIN_THROTTLE_LIMIT = 5;

  /** Contact-form messages per minute and client (public POST /contact). */
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  CONTACT_THROTTLE_LIMIT = 5;

  /** Days a temporary password (new, imported or reset account) stays valid before the secretariat must issue another. */
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(90)
  TEMP_PASSWORD_TTL_DAYS = 14;

  /** Handled contact messages are deleted this many days after they were handled (checked daily). */
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(3650)
  CONTACT_RETENTION_DAYS = 365;

  /**
   * Reverse proxies in front of the API (Express `trust proxy` hops), so rate limits see the visitor's
   * address from X-Forwarded-For. 0 (default) when clients connect directly; set it to the number of
   * proxies, never more, or anyone could forge their address.
   */
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(0)
  @Max(5)
  TRUST_PROXY = 0;

  /**
   * `Secure` flag of the refresh cookie. Unset: on in production (the site is served over HTTPS), off otherwise.
   * Set it to `false` only to try the production build over plain HTTP on another address than localhost.
   */
  @IsOptional()
  @Transform(({ value }) =>
    value === undefined || value === '' ? undefined : value === true || value === 'true',
  )
  @IsBoolean()
  COOKIE_SECURE?: boolean;

  /**
   * Domain of the school login e-mails built at import (`prenom.nom@<domain>`), without the @.
   * Required in production (the demo domain is refused there).
   */
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsFQDN(
    { require_tld: true, allow_underscores: false },
    { message: 'SCHOOL_EMAIL_DOMAIN must be a domain such as lasalle-daher.eg' },
  )
  SCHOOL_EMAIL_DOMAIN = DEMO_EMAIL_DOMAIN;

  /** Minutes a « mot de passe oublié » link stays valid. */
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(5)
  @Max(1440)
  PASSWORD_RESET_TTL_MINUTES = 60;

  /** Public address of the website, without a trailing slash: the base of the links sent by e-mail. */
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().replace(/\/+$/, '') : value))
  @IsUrl(
    { require_tld: false, require_protocol: true, protocols: ['http', 'https'] },
    { message: 'PUBLIC_WEB_URL must be an http(s) address such as https://www.lasalle-daher.eg' },
  )
  PUBLIC_WEB_URL = 'http://localhost:4200';

  /** `log`: the mail is written to the API log and apps/api/.dev-mail (development); `smtp`: really sent. */
  @IsIn(['log', 'smtp'], { message: 'MAIL_TRANSPORT must be log or smtp' })
  MAIL_TRANSPORT: 'log' | 'smtp' = 'log';

  /** Sender of every mail, e.g. `Collège de la Salle <no-reply@lasalle-daher.eg>`. */
  @IsString()
  @IsNotEmpty()
  MAIL_FROM = `Collège de la Salle <no-reply@${DEMO_EMAIL_DOMAIN}>`;

  /** SMTP server (required when MAIL_TRANSPORT=smtp). */
  @IsOptional()
  @IsString()
  SMTP_HOST?: string;

  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(65535)
  SMTP_PORT = 587;

  /** TLS from the first byte (port 465). Leave false for STARTTLS on port 587. */
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  SMTP_SECURE = false;

  @IsOptional()
  @IsString()
  SMTP_USER?: string;

  @IsOptional()
  @IsString()
  SMTP_PASSWORD?: string;

  /** In-app notifications are deleted this many days after they were created (checked daily). */
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(7)
  @Max(3650)
  NOTIFICATION_RETENTION_DAYS = 180;

  /**
   * Minutes between two e-mail digests: a user who opted in gets at most one mail per interval, listing
   * every notification since the last one.
   */
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(180)
  NOTIFICATION_MAIL_INTERVAL_MINUTES = 10;

  /** Requests a minute one client may make to GET /api/calendar/feed/:token.ics (calendar apps poll hourly; a whole class behind one address stays far below it). */
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(10000)
  FEED_THROTTLE_LIMIT = 60;
}

export function validateEnv(raw: Record<string, unknown>): Env {
  const env = plainToInstance(Env, raw, { exposeDefaultValues: true });
  const errors = validateSync(env, { skipMissingProperties: false });
  if (errors.length) {
    const details = errors.flatMap((e) => Object.values(e.constraints ?? {})).join('\n  - ');
    throw new Error(`Invalid environment (see apps/api/.env.example):\n  - ${details}`);
  }
  if (
    env.NODE_ENV === 'production' &&
    [env.JWT_ACCESS_SECRET, env.JWT_REFRESH_SECRET].some((s) => PLACEHOLDER.test(s))
  ) {
    throw new Error(
      'JWT secrets still hold the .env.example placeholders; set real random values in production.',
    );
  }
  if (env.NODE_ENV === 'production' && env.SCHOOL_EMAIL_DOMAIN === DEMO_EMAIL_DOMAIN) {
    throw new Error(
      'SCHOOL_EMAIL_DOMAIN is the demo domain; set the login domain of the school in production.',
    );
  }
  if (env.MAIL_TRANSPORT === 'smtp' && !env.SMTP_HOST) {
    throw new Error(
      'MAIL_TRANSPORT=smtp needs SMTP_HOST (and usually SMTP_USER and SMTP_PASSWORD).',
    );
  }
  if (env.NODE_ENV === 'production' && env.MAIL_TRANSPORT === 'log') {
    throw new Error(
      'MAIL_TRANSPORT=log writes reset links to the log; set MAIL_TRANSPORT=smtp in production.',
    );
  }
  return env;
}
