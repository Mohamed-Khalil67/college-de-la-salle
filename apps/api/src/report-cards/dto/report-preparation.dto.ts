import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import {
  REPORT_GAP_REASONS,
  type ReportGapDto as ReportGapContract,
  type ReportGapReason,
  type ReportGapTeacherDto as ReportGapTeacherContract,
  type ReportPreparationClassDto as ReportPreparationClassContract,
  type ReportPreparationDto as ReportPreparationContract,
  type ReportReminderRequest,
  type ReportReminderResponse,
  type SectionId,
} from '@cdls/shared';
import { PeriodDto } from '../../periods/dto/period.dto.js';

export class ReportGapTeacherDto implements ReportGapTeacherContract {
  teacherId: string;
  name: string;
}

export class ReportGapDto implements ReportGapContract {
  subjectId: string;
  subjectName: string;
  @ApiProperty({ enum: REPORT_GAP_REASONS })
  reason: ReportGapReason;
  entered: number;
  total: number;
  @ApiProperty({ type: [ReportGapTeacherDto] })
  teachers: ReportGapTeacherDto[];
}

export class ReportPreparationClassDto implements ReportPreparationClassContract {
  classId: string;
  label: string;
  @ApiProperty({ enum: ['nationale', 'bac'] })
  sectionCode: SectionId;
  studentCount: number;
  subjectCount: number;
  complete: boolean;
  @ApiProperty({ type: [ReportGapDto] })
  gaps: ReportGapDto[];
  cardsGenerated: number;
  cardsPublished: number;
}

export class ReportPreparationDto implements ReportPreparationContract {
  period: PeriodDto;
  @ApiProperty({ type: [ReportPreparationClassDto] })
  classes: ReportPreparationClassDto[];
  classCount: number;
  completeClassCount: number;
  subjectCount: number;
  readySubjectCount: number;
  lateTeacherCount: number;
}

export class ReportReminderDto implements ReportReminderRequest {
  /** Omit to remind the teachers of every class of the period. */
  @IsOptional()
  @IsUUID()
  classId?: string;
}

export class ReportReminderResultDto implements ReportReminderResponse {
  teachers: number;
  notified: number;
  alreadyReminded: number;
  unreachable: number;
  withoutTeacher: number;
}
