import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AccessModule } from './access/access.module.js';
import { ActivityTypesModule } from './activity-types/activity-types.module.js';
import { AuthModule } from './auth/auth.module.js';
import { CalendarDaysModule } from './calendar-days/calendar-days.module.js';
import { CalendarFeedModule } from './calendar-feed/calendar-feed.module.js';
import { ClassSubjectsModule } from './class-subjects/class-subjects.module.js';
import { JwtAuthGuard } from './auth/jwt-auth.guard.js';
import { clientKey, trafficTracker } from './common/client-key.js';
import { RolesGuard } from './common/roles.guard.js';
import { validateEnv, type Env } from './config/env.validation.js';
import { MailModule } from './mail/mail.module.js';
import { HealthModule } from './health/health.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { AttendanceModule } from './attendance/attendance.module.js';
import { ClassesModule } from './classes/classes.module.js';
import { ContactModule } from './contact/contact.module.js';
import { EventsModule } from './events/events.module.js';
import { GradesModule } from './grades/grades.module.js';
import { GroupsModule } from './groups/groups.module.js';
import { HomeworkModule } from './homework/homework.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { PeriodsModule } from './periods/periods.module.js';
import { PostsModule } from './posts/posts.module.js';
import { RolloverModule } from './rollover/rollover.module.js';
import { ReportCardsModule } from './report-cards/report-cards.module.js';
import { RoomsModule } from './rooms/rooms.module.js';
import { SchoolYearsModule } from './school-years/school-years.module.js';
import { SectionChangesModule } from './section-changes/section-changes.module.js';
import { SubjectsModule } from './subjects/subjects.module.js';
import { PlannerModule } from './planner/planner.module.js';
import { TeacherSummaryModule } from './teacher-summary/teacher-summary.module.js';
import { TimetableModule } from './timetable/timetable.module.js';
import { TeachingAssignmentsModule } from './teaching-assignments/teaching-assignments.module.js';
import { UsersModule } from './users/users.module.js';

/** Routes whose `default` limit does not count by address: the `ip` throttler caps the address as a whole. */
const IP_CEILING_ROUTES = ['/auth/login', '/auth/password', '/auth/forgot-password', '/auth/refresh'];

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true, validate: validateEnv }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        // Only reads the account id for the rate-limit key; the authentication guard checks the token for real.
        const jwt = new JwtService({
          secret: config.get('JWT_ACCESS_SECRET', { infer: true }),
          verifyOptions: { algorithms: ['HS256'], issuer: 'cdls-api', ignoreExpiration: true },
        });
        const subjectOf = (token: string): string | null => {
          try {
            const { sub } = jwt.verify<{ sub?: unknown }>(token);
            return typeof sub === 'string' ? sub : null;
          } catch {
            return null;
          }
        };
        // One counter per IPv4 address or IPv6 /64 (a client could rotate through its /64).
        const byAddress = (req: Record<string, unknown>) => clientKey(req['ip'] as string | undefined);
        return {
          throttlers: [
            {
              ttl: config.get('THROTTLE_TTL_MS', { infer: true }),
              limit: config.get('THROTTLE_LIMIT', { infer: true }),
              // Per account when a signed access token comes with the request, per address otherwise:
              // the school's one public address must not cap every class together.
              getTracker: trafficTracker(subjectOf),
            },
            // Counts by address alone. Only the sign-in and refresh routes use it (they override its limit
            // and count `default` by e-mail, account or refresh token): it is their ceiling per address.
            {
              name: 'ip',
              ttl: config.get('THROTTLE_TTL_MS', { infer: true }),
              limit: config.get('THROTTLE_LIMIT', { infer: true }),
              getTracker: byAddress,
              skipIf: (context) => {
                const path = String(
                  context.switchToHttp().getRequest<{ path?: string }>().path ?? '',
                );
                return !IP_CEILING_ROUTES.some((route) => path.endsWith(route));
              },
            },
          ],
          getTracker: byAddress,
        };
      },
    }),
    PrismaModule,
    MailModule,
    AccessModule,
    AuthModule,
    HealthModule,
    UsersModule,
    SchoolYearsModule,
    PeriodsModule,
    CalendarDaysModule,
    ClassesModule,
    SubjectsModule,
    ClassSubjectsModule,
    RoomsModule,
    ActivityTypesModule,
    TeachingAssignmentsModule,
    EventsModule,
    HomeworkModule,
    GradesModule,
    GroupsModule,
    AttendanceModule,
    PostsModule,
    ReportCardsModule,
    ContactModule,
    SectionChangesModule,
    TimetableModule,
    PlannerModule,
    TeacherSummaryModule,
    RolloverModule,
    NotificationsModule,
    CalendarFeedModule,
  ],
  providers: [
    // Order matters: rate limit, then authentication, then roles.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useExisting: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
