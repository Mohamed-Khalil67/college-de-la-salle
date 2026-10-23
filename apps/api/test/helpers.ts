import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { SessionResponse } from '@cdls/shared';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { inject } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { MAIL_TRANSPORT, type MailMessage } from '../src/mail/mail-transport.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

export const DOMAIN = 'demo.cdls.test';
export const ADMIN = `admin@${DOMAIN}`;
/** Teaches mathématiques in every class. */
export const MATHS_TEACHER = `hany.mansour@${DOMAIN}`;
/** A coordinateur (informatique, SES): edits the year's structure without being an admin. */
export const COORDINATOR = `ingy.samir@${DOMAIN}`;
/** Teaches français and humanités: Bac français classes only. */
export const FRENCH_TEACHER = `claire.dubois@${DOMAIN}`;

export interface TestApp {
  readonly app: INestApplication<App>;
  readonly prisma: PrismaService;
  /** Every mail the app "sent" (the transport is replaced by this list). */
  readonly mails: MailMessage[];
  readonly http: () => ReturnType<typeof request>;
  /** Logs in (once per e-mail and app; the login route allows 5 attempts a minute) and returns a bearer token. */
  readonly token: (email: string) => Promise<string>;
  readonly close: () => Promise<void>;
}

export async function createTestApp(): Promise<TestApp> {
  const mails: MailMessage[] = [];
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MAIL_TRANSPORT)
    .useValue({
      send: (message: MailMessage) => {
        mails.push(message);
        return Promise.resolve();
      },
    })
    .compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>();
  configureApp(app);
  await app.init();
  const http = () => request(app.getHttpServer());
  const tokens = new Map<string, string>();
  return {
    app,
    prisma: app.get(PrismaService),
    mails,
    http,
    token: async (email) => {
      const cached = tokens.get(email);
      if (cached) return cached;
      const res = await http()
        .post('/api/auth/login')
        .send({ email, password: inject('password') })
        .expect(200);
      const token = (res.body as SessionResponse).accessToken;
      tokens.set(email, token);
      return token;
    },
    close: () => app.close(),
  };
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

/** The first student (by name) of a class, with their login e-mail. */
export async function studentOf(prisma: PrismaService, section: string, classCode: string) {
  const enrollment = await prisma.enrollment.findFirstOrThrow({
    where: { schoolClass: { code: classCode, section: { code: section } } },
    include: { student: { include: { user: true } }, schoolClass: true },
    orderBy: { student: { user: { email: 'asc' } } },
  });
  return {
    studentId: enrollment.studentId,
    email: enrollment.student.user.email,
    classId: enrollment.classId,
  };
}

/** The id of a system activity type (`cours`, `examen`, `devoir`…). */
export async function activityTypeId(prisma: PrismaService, code: string): Promise<string> {
  return (await prisma.activityType.findUniqueOrThrow({ where: { code } })).id;
}

/** A class event of a given kind (and optionally subject) from the seed. */
export function seededEvent(
  prisma: PrismaService,
  classId: string,
  kind: 'examen' | 'controle' | 'devoir' | 'cours',
  subjectId?: string,
) {
  return prisma.event.findFirstOrThrow({
    where: { classId, activityType: { code: kind }, ...(subjectId ? { subjectId } : {}) },
  });
}
