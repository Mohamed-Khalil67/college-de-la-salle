import { plainToInstance, Transform } from 'class-transformer';
import {
  IsIn,
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
  return env;
}
