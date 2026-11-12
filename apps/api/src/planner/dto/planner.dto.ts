import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  ABSENCE_CHOICE_KINDS,
  ABSENCE_MAX_CHOICES,
  type AbsenceChoice,
  type AbsenceChoiceKind,
  type AbsencePreviewDto as AbsencePreviewContract,
  type AbsencePreviewQuery,
  type AbsenceSessionDto as AbsenceSessionContract,
  type AbsenceTeacherOption as AbsenceTeacherContract,
  type ApplyAbsenceRequest,
  type ApplyAbsenceResult as ApplyAbsenceResultContract,
  type PlannerChangeDto as ChangeContract,
  type PlannerClassCoverageDto as CoverageContract,
  type PlannerMissingSubjectDto as MissingContract,
  type PlannerRoomNowDto as RoomNowContract,
  type PlannerRoomsNowDto as RoomsNowContract,
  type PlannerTimetablesDto as TimetablesContract,
  type PlannerTodayDto as TodayContract,
  ROOM_KINDS,
  type RoomKind,
  SLOT_EXCEPTION_KINDS,
  type SlotExceptionKind,
  TIMETABLE_LIMITS,
  type TimetableWarningDto,
} from '@cdls/shared';
import { IsDay } from '../../common/dates.js';
import { AcknowledgedWarningDto } from '../../timetable/dto/timetable.dto.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const emptyToNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? (value.trim() === '' ? null : value.trim()) : value;

/* Requests ------------------------------------------------------------------------------------- */

export class AbsencePreviewQueryDto implements AbsencePreviewQuery {
  @IsUUID()
  teacherId: string;

  @IsDay()
  from: string;

  @IsDay()
  to: string;
}

export class PlannerDayQueryDto {
  /** Defaults to today (Cairo). */
  @IsOptional()
  @IsDay()
  date?: string;
}

export class AbsenceChoiceDto implements AbsenceChoice {
  @IsUUID()
  slotId: string;

  @IsDay()
  date: string;

  @ApiProperty({ enum: ABSENCE_CHOICE_KINDS })
  @IsIn(ABSENCE_CHOICE_KINDS)
  kind: AbsenceChoiceKind;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @Transform(emptyToNull)
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  teacherId?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @Transform(emptyToNull)
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  roomId?: string | null;
}

export class ApplyAbsenceDto implements ApplyAbsenceRequest {
  @IsUUID()
  teacherId: string;

  @IsDay()
  from: string;

  @IsDay()
  to: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(TIMETABLE_LIMITS.reason)
  reason?: string;

  @ApiProperty({ type: [AbsenceChoiceDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(ABSENCE_MAX_CHOICES)
  @ValidateNested({ each: true })
  @Type(() => AbsenceChoiceDto)
  choices: AbsenceChoiceDto[];

  @ApiPropertyOptional({ type: [AcknowledgedWarningDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => AcknowledgedWarningDto)
  acknowledgedWarnings?: AcknowledgedWarningDto[];
}

/* Responses ------------------------------------------------------------------------------------ */

export class AbsenceTeacherOptionDto implements AbsenceTeacherContract {
  teacherId: string;
  name: string;
  sameSubject: boolean;
}

export class AbsenceSessionDto implements AbsenceSessionContract {
  slotId: string;
  date: string;
  classLabel: string;
  @ApiProperty({ type: String, nullable: true })
  groupLabel: string | null;
  subjectName: string;
  startTime: string;
  endTime: string;
  @ApiProperty({ type: String, nullable: true })
  roomId: string | null;
  @ApiProperty({ type: String, nullable: true })
  roomName: string | null;
  @ApiProperty({ enum: SLOT_EXCEPTION_KINDS, nullable: true })
  currentKind: SlotExceptionKind | null;
  @ApiProperty({ type: [AbsenceTeacherOptionDto] })
  freeTeachers: readonly AbsenceTeacherOptionDto[];
}

export class AbsencePreviewDto implements AbsencePreviewContract {
  teacherId: string;
  teacherName: string;
  from: string;
  to: string;
  @ApiProperty({ type: [AbsenceSessionDto] })
  sessions: readonly AbsenceSessionDto[];
}

export class ApplyAbsenceResultDto implements ApplyAbsenceResultContract {
  cancelled: number;
  substituted: number;
  study: number;
  notified: number;
  @ApiProperty({ type: 'array', items: { type: 'object' } })
  warnings: readonly TimetableWarningDto[];
}

export class PlannerChangeDto implements ChangeContract {
  slotId: string;
  date: string;
  @ApiProperty({ enum: SLOT_EXCEPTION_KINDS })
  kind: SlotExceptionKind;
  classLabel: string;
  subjectName: string;
  startTime: string;
  endTime: string;
  teacherName: string;
  @ApiProperty({ type: String, nullable: true })
  coverName: string | null;
  @ApiProperty({ type: String, nullable: true })
  roomName: string | null;
  reason: string;
  notified: boolean;
}

export class PlannerTodayDto implements TodayContract {
  date: string;
  @ApiProperty({ type: [PlannerChangeDto] })
  changes: readonly PlannerChangeDto[];
}

export class PlannerRoomNowDto implements RoomNowContract {
  id: string;
  name: string;
  @ApiProperty({ enum: ROOM_KINDS })
  kind: RoomKind;
  @ApiProperty({ type: Number, nullable: true })
  capacity: number | null;
  @ApiProperty({ type: String, nullable: true })
  freeUntil: string | null;
}

export class PlannerRoomsNowDto implements RoomsNowContract {
  date: string;
  time: string;
  @ApiProperty({ type: [PlannerRoomNowDto] })
  free: readonly PlannerRoomNowDto[];
  total: number;
}

export class PlannerMissingSubjectDto implements MissingContract {
  subjectName: string;
  missingHours: number;
}

export class PlannerClassCoverageDto implements CoverageContract {
  classId: string;
  label: string;
  expectedHours: number;
  placedHours: number;
  @ApiProperty({ type: [PlannerMissingSubjectDto] })
  missing: readonly PlannerMissingSubjectDto[];
  complete: boolean;
}

export class PlannerTimetablesDto implements TimetablesContract {
  @ApiProperty({ type: String, nullable: true })
  yearLabel: string | null;
  @ApiProperty({ type: [PlannerClassCoverageDto] })
  classes: readonly PlannerClassCoverageDto[];
  teachersPlaced: number;
  teachersTotal: number;
}
