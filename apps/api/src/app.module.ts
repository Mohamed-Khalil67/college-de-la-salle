import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AccessModule } from './access/access.module.js';
import { ActivityTypesModule } from './activity-types/activity-types.module.js';
import { AuthModule } from './auth/auth.module.js';
import { CalendarDaysModule } from './calendar-days/calendar-days.module.js';
import { ClassSubjectsModule } from './class-subjects/class-subjects.module.js';
import { JwtAuthGuard } from './auth/jwt-auth.guard.js';
import { clientKey } from './common/client-key.js';
import { RolesGuard } from './common/roles.guard.js';
import { validateEnv, type Env } from './config/env.validation.js';
import { HealthModule } from './health/health.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { AttendanceModule } from './attendance/attendance.module.js';
import { ClassesModule } from './classes/classes.module.js';
import { ContactModule } from './contact/contact.module.js';
import { EventsModule } from './events/events.module.js';
import { GradesModule } from './grades/grades.module.js';
import { HomeworkModule } from './homework/homework.module.js';
import { PeriodsModule } from './periods/periods.module.js';
import { PostsModule } from './posts/posts.module.js';
import { ReportCardsModule } from './report-cards/report-cards.module.js';
import { RoomsModule } from './rooms/rooms.module.js';
import { SchoolYearsModule } from './school-years/school-years.module.js';
import { SectionChangesModule } from './section-changes/section-changes.module.js';
import { SubjectsModule } from './subjects/subjects.module.js';
import { TimetableModule } from './timetable/timetable.module.js';
import { TeachingAssignmentsModule } from './teaching-assignments/teaching-assignments.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true, validate: validateEnv }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        throttlers: [
          {
            ttl: config.get('THROTTLE_TTL_MS', { infer: true }),
            limit: config.get('THROTTLE_LIMIT', { infer: true }),
          },
          // Counts by address alone on every route; sign-in routes override `default` to count by address
          // and account (see AuthController) and keep this one as the ceiling per address.
          {
            name: 'ip',
            ttl: config.get('THROTTLE_TTL_MS', { infer: true }),
            limit: config.get('THROTTLE_LIMIT', { infer: true }),
            // Only the sign-in routes need it (they override its limit); elsewhere `default` already counts by address.
            skipIf: (context) => {
              const path = String(context.switchToHttp().getRequest<{ path?: string }>().path ?? '');
              return !(path.endsWith('/auth/login') || path.endsWith('/auth/password'));
            },
          },
        ],
        // One counter per IPv4 address or IPv6 /64 (a client could rotate through its /64).
        getTracker: (req: Record<string, unknown>) => clientKey(req['ip'] as string | undefined),
      }),
    }),
    PrismaModule,
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
    AttendanceModule,
    PostsModule,
    ReportCardsModule,
    ContactModule,
    SectionChangesModule,
    TimetableModule,
  ],
  providers: [
    // Order matters: rate limit, then authentication, then roles.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useExisting: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
