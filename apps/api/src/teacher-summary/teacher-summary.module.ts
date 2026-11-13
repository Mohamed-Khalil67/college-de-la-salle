import { Module } from '@nestjs/common';
import { CalendarDaysModule } from '../calendar-days/calendar-days.module.js';
import { EventsModule } from '../events/events.module.js';
import { GradesModule } from '../grades/grades.module.js';
import { TargetsModule } from '../targets/targets.module.js';
import { TimetableModule } from '../timetable/timetable.module.js';
import { TeacherSummaryController } from './teacher-summary.controller.js';
import { TeacherSummaryService } from './teacher-summary.service.js';

/** « Mon accueil » for teachers: one read that gathers what the home page blocks show. */
@Module({
  imports: [CalendarDaysModule, EventsModule, GradesModule, TargetsModule, TimetableModule],
  controllers: [TeacherSummaryController],
  providers: [TeacherSummaryService],
})
export class TeacherSummaryModule {}
