import { BadRequestException, type INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { API_PREFIX } from './app.prefix.js';
import { AppLogger, requestLogging } from './common/app-logger.js';
import { validationMessages } from './common/validation-messages.js';
import type { Env } from './config/env.validation.js';
import { activeSchool } from './school/school-profile.js';

export { API_PREFIX };
export const DOCS_PATH = `${API_PREFIX}/docs`;

/** Cross-cutting HTTP setup, shared by main.ts and the e2e tests so both run the same app. */
export function configureApp(app: INestApplication): void {
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  const proxies = config.get('TRUST_PROXY', { infer: true });
  if (proxies > 0) {
    // Behind the school's reverse proxy: req.ip (and so the rate limits) is the visitor's address.
    (app.getHttpAdapter().getInstance() as { set(key: string, value: unknown): void }).set(
      'trust proxy',
      proxies,
    );
  }
  // Structured log: level from LOG_LEVEL, JSON in production, the school id and a request id in every line.
  const logger = new AppLogger({
    level: config.get('LOG_LEVEL', { infer: true }),
    json: config.get('NODE_ENV', { infer: true }) === 'production',
    school: activeSchool().id,
  });
  app.useLogger(logger);
  // First, so every later middleware, guard and handler runs inside the request's scope.
  app.use(requestLogging(logger));
  app.setGlobalPrefix(API_PREFIX);
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: config
      .get('CORS_ORIGIN', { infer: true })
      .split(',')
      .map((o) => o.trim()),
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      // French messages (the DTO's own, or a French one for class-validator's English defaults) and a code.
      exceptionFactory: (errors) =>
        new BadRequestException({
          statusCode: 400,
          message: validationMessages(errors),
          error: 'Bad Request',
          code: 'VALIDATION_FAILED',
        }),
    }),
  );
  app.enableShutdownHooks();

  if (config.get('NODE_ENV', { infer: true }) !== 'production') {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('CDLS API')
        .setDescription(`${activeSchool().names.fr.full}, ${activeSchool().names.fr.place}: school space API.`)
        .setVersion('0.1.0')
        .addBearerAuth()
        .addCookieAuth('cdls_refresh')
        .build(),
    );
    SwaggerModule.setup(DOCS_PATH, app, document);
  }
}
