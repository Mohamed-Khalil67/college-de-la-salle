import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp, DOCS_PATH } from './app.setup.js';
import type { Env } from './config/env.validation.js';

const app = await NestFactory.create(AppModule);
configureApp(app);

const port = app.get<ConfigService<Env, true>>(ConfigService).get('PORT', { infer: true });
await app.listen(port);
Logger.log(`API on http://localhost:${port}/api — docs at /${DOCS_PATH}`, 'Bootstrap');
