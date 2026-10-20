import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { API_PREFIX } from './app.prefix.js';
import type { Env } from './config/env.validation.js';

export { API_PREFIX };
export const DOCS_PATH = `${API_PREFIX}/docs`;

/** Cross-cutting HTTP setup, shared by main.ts and the e2e tests so both run the same app. */
export function configureApp(app: INestApplication): void {
  const config = app.get<ConfigService<Env, true>>(ConfigService);

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
    }),
  );
  app.enableShutdownHooks();

  if (config.get('NODE_ENV', { infer: true }) !== 'production') {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('CDLS API')
        .setDescription('Collège de la Salle, Daher: school space API.')
        .setVersion('0.1.0')
        .addBearerAuth()
        .addCookieAuth('cdls_refresh')
        .build(),
    );
    SwaggerModule.setup(DOCS_PATH, app, document);
  }
}
