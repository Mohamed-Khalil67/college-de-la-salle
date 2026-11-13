import { ApiProperty } from '@nestjs/swagger';
import {
  TEACHER_SUMMARY_SECTIONS,
  type RepeatedAbsenceDto as AbsenceContract,
  type TeacherSummaryClassDto as ClassContract,
  type TeacherSummaryDto as SummaryContract,
  type TeacherSummaryHomeworkDto as HomeworkContract,
  type TeacherSummaryLessonDto as LessonContract,
  type TeacherSummaryPendingDto as PendingContract,
  type TeacherSummarySection,
} from '@cdls/shared';
import { CalendarDayDto } from '../../calendar-days/dto/calendar-day.dto.js';
import { OccurrenceDto } from '../../events/dto/event.dto.js';
import { PendingGradingDto } from '../../grades/dto/grade.dto.js';
import { TimetableOccurrenceDto } from '../../timetable/dto/timetable.dto.js';

export class TeacherSummaryClassDto implements ClassContract {
  classId: string;
  classLabel: string;
}

export class TeacherSummaryLessonDto implements LessonContract {
  session: TimetableOccurrenceDto;
  rollCallDone: boolean;
}

export class TeacherSummaryPendingDto implements PendingContract {
  classId: string;
  subjectId: string;
  label: string;
  @ApiProperty({ type: [PendingGradingDto] })
  pending: readonly PendingGradingDto[];
}

export class TeacherSummaryHomeworkDto implements HomeworkContract {
  occurrence: OccurrenceDto;
  done: number;
}

export class RepeatedAbsenceDto implements AbsenceContract {
  studentId: string;
  firstName: string;
  lastName: string;
  classId: string;
  classLabel: string;
  days: number;
  lastDay: string;
}

export class TeacherSummaryDto implements SummaryContract {
  today: string;
  @ApiProperty({ enum: TEACHER_SUMMARY_SECTIONS, isArray: true })
  failed: readonly TeacherSummarySection[];
  @ApiProperty({ type: [TeacherSummaryClassDto] })
  classes: readonly TeacherSummaryClassDto[];
  @ApiProperty({ type: [TeacherSummaryLessonDto] })
  lessons: readonly TeacherSummaryLessonDto[];
  @ApiProperty({ type: [CalendarDayDto] })
  calendarDays: readonly CalendarDayDto[];
  @ApiProperty({ type: [TeacherSummaryPendingDto] })
  pending: readonly TeacherSummaryPendingDto[];
  @ApiProperty({ type: [TeacherSummaryHomeworkDto] })
  homework: readonly TeacherSummaryHomeworkDto[];
  @ApiProperty({ type: [OccurrenceDto] })
  tests: readonly OccurrenceDto[];
  @ApiProperty({ type: [RepeatedAbsenceDto] })
  absences: readonly RepeatedAbsenceDto[];
}
