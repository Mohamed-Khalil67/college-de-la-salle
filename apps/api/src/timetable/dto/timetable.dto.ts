import {
  ApiExtraModels,
  ApiProperty,
  ApiPropertyOptional,
  getSchemaPath,
  PartialType,
} from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  type AcknowledgedWarning,
  type CreateSlotExceptionRequest,
  type CreateTimetableSlotRequest,
  type DeleteTimetableSlotQuery,
  type FreeRoomDto as FreeRoomContract,
  type FreeRoomsQuery,
  type OccurrenceStatus,
  type RoomKind,
  ROOM_KINDS,
  type SessionChange,
  type SessionValuesDto as SessionValuesContract,
  SLOT_EXCEPTION_KINDS,
  SLOT_SCOPES,
  type SlotExceptionDto as SlotExceptionContract,
  type SlotExceptionInput,
  type SlotExceptionKind,
  type SlotScope,
  TIMETABLE_LIMITS,
  TIMETABLE_SUGGESTION_TARGETS,
  TIMETABLE_WARNING_CODES,
  type TimetableCheckRequest,
  type TimetableCheckResult as CheckResultContract,
  type TimetableConflictDto as ConflictContract,
  type TimetableConflictKind,
  type TimetableOccurrenceDto as OccurrenceContract,
  type TimetableOccurrenceQuery,
  type TimetableRoomSuggestionDto as RoomSuggestionContract,
  type TimetableSlotDto as SlotContract,
  type TimetableSuggestionTarget,
  type TimetableTimeSuggestionDto as TimeSuggestionContract,
  type TimetableSlotInput,
  type TimetableSlotListQuery,
  type TimetableWarningCode,
  type TimetableWarningDto as WarningContract,
  type TimetableWriteResult as WriteResultContract,
  type UpdateTimetableSlotRequest,
  type WeekParity,
  WEEK_PARITIES,
} from '@cdls/shared';
import { IsDay } from '../../common/dates.js';
import { PaginationQueryDto } from '../../common/pagination.js';
import { emptyToNull, trim } from '../../common/transforms.js';
import { ActivityTypeSummaryDto } from '../../activity-types/dto/activity-type.dto.js';

const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;
const CLOCK_MESSAGE = '$property must be a time written HH:MM';

/* Requests ------------------------------------------------------------------------------------- */

export class TimetableSlotInputDto implements TimetableSlotInput {
  @IsUUID()
  classSubjectId: string;

  @IsUUID()
  teacherId: string;

  /** null: no room (a session outside the school). */
  @ApiProperty({ type: String, nullable: true })
  @Transform(emptyToNull)
  @ValidateIf((o: TimetableSlotInputDto) => o.roomId !== null)
  @IsUUID()
  roomId: string | null;

  /** A repeatable, non-homework activity type of the school (cours, TD, TP…). */
  @IsUUID()
  activityTypeId: string;

  /** 0 = Sunday … 6 = Saturday. */
  @IsInt()
  @Min(0)
  @Max(6)
  weekday: number;

  @Matches(CLOCK, { message: CLOCK_MESSAGE })
  startTime: string;

  @Matches(CLOCK, { message: CLOCK_MESSAGE })
  endTime: string;

  @IsDay()
  validFrom: string;

  @IsDay()
  validTo: string;

  @ApiProperty({ enum: WEEK_PARITIES, nullable: true })
  @Transform(emptyToNull)
  @ValidateIf((o: TimetableSlotInputDto) => o.weekParity !== null)
  @IsIn(WEEK_PARITIES)
  weekParity: WeekParity | null;

  /** Division of parallel groups (« TP »); null: the whole class. */
  @ApiProperty({ type: String, nullable: true })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? (value.trim() === '' ? null : value.trim()) : value,
  )
  @ValidateIf((o: TimetableSlotInputDto) => o.division !== null)
  @IsString()
  @MinLength(1)
  @MaxLength(TIMETABLE_LIMITS.division)
  division: string | null;

  /**
   * The group the session is for (a group of the slot's class, GET /groups?classId=). The division is
   * then the group's: leave `division` null, or send the same one.
   */
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @Transform(emptyToNull)
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  groupId?: string | null;
}

export class AcknowledgedWarningDto implements AcknowledgedWarning {
  @ApiProperty({ enum: TIMETABLE_WARNING_CODES })
  @IsIn(TIMETABLE_WARNING_CODES)
  code: TimetableWarningCode;

  /** Why the warning is accepted; kept in the audit log. */
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(TIMETABLE_LIMITS.reason)
  reason: string;
}

export class SlotExceptionInputDto implements SlotExceptionInput {
  @ApiProperty({ enum: SLOT_EXCEPTION_KINDS })
  @IsIn(SLOT_EXCEPTION_KINDS)
  kind: SlotExceptionKind;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @Transform(emptyToNull)
  @ValidateIf((_, v) => v !== null)
  @IsDay()
  newDate?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @Transform(emptyToNull)
  @ValidateIf((_, v) => v !== null)
  @Matches(CLOCK, { message: CLOCK_MESSAGE })
  newStart?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @Transform(emptyToNull)
  @ValidateIf((_, v) => v !== null)
  @Matches(CLOCK, { message: CLOCK_MESSAGE })
  newEnd?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @Transform(emptyToNull)
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  newRoomId?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @Transform(emptyToNull)
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  newTeacherId?: string | null;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(TIMETABLE_LIMITS.reason)
  reason?: string;
}

class WithWarnings {
  @ApiPropertyOptional({ type: [AcknowledgedWarningDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => AcknowledgedWarningDto)
  acknowledgedWarnings?: AcknowledgedWarningDto[];
}

export class CreateTimetableSlotDto
  extends TimetableSlotInputDto
  implements CreateTimetableSlotRequest
{
  @ApiPropertyOptional({ type: [AcknowledgedWarningDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => AcknowledgedWarningDto)
  acknowledgedWarnings?: AcknowledgedWarningDto[];
}

/** Any field of a slot, for « celle-ci et les suivantes » and « toute la série ». */
export class SlotChangesDto extends PartialType(TimetableSlotInputDto) {}

export class UpdateTimetableSlotDto extends WithWarnings implements UpdateTimetableSlotRequest {
  @ApiProperty({ enum: SLOT_SCOPES })
  @IsIn(SLOT_SCOPES)
  scope: SlotScope;

  /** The day of the session (this, following). */
  @IsOptional()
  @IsDay()
  date?: string;

  @ApiPropertyOptional({ type: SlotChangesDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SlotChangesDto)
  changes?: SlotChangesDto;

  @ApiPropertyOptional({ type: SlotExceptionInputDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SlotExceptionInputDto)
  exception?: SlotExceptionInputDto;
}

export class DeleteTimetableSlotQueryDto implements DeleteTimetableSlotQuery {
  @ApiProperty({ enum: SLOT_SCOPES })
  @IsIn(SLOT_SCOPES)
  scope: SlotScope;

  @IsOptional()
  @IsDay()
  date?: string;
}

export class CreateSlotExceptionDto
  extends SlotExceptionInputDto
  implements CreateSlotExceptionRequest
{
  /** The original day of the session. */
  @IsDay()
  date: string;

  @ApiPropertyOptional({ type: [AcknowledgedWarningDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => AcknowledgedWarningDto)
  acknowledgedWarnings?: AcknowledgedWarningDto[];
}

export class TimetableCheckDto implements TimetableCheckRequest {
  @IsOptional()
  @IsUUID()
  slotId?: string;

  @ApiPropertyOptional({ type: TimetableSlotInputDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => TimetableSlotInputDto)
  slot?: TimetableSlotInputDto;

  @ApiPropertyOptional({ enum: SLOT_SCOPES })
  @IsOptional()
  @IsIn(SLOT_SCOPES)
  scope?: SlotScope;

  @IsOptional()
  @IsDay()
  date?: string;

  @ApiPropertyOptional({ type: SlotChangesDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SlotChangesDto)
  changes?: SlotChangesDto;

  @ApiPropertyOptional({ type: SlotExceptionInputDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SlotExceptionInputDto)
  exception?: SlotExceptionInputDto;
}

export class TimetableSlotListQueryDto
  extends PaginationQueryDto
  implements TimetableSlotListQuery
{
  @IsOptional()
  @IsUUID()
  classId?: string;

  @IsOptional()
  @IsUUID()
  teacherId?: string;

  @IsOptional()
  @IsUUID()
  roomId?: string;
}

export class TimetableOccurrenceQueryDto implements TimetableOccurrenceQuery {
  @IsOptional()
  @IsUUID()
  classId?: string;

  @IsOptional()
  @IsUUID()
  teacherId?: string;

  @IsOptional()
  @IsUUID()
  roomId?: string;

  @IsDay()
  from: string;

  @IsDay()
  to: string;
}

export class FreeRoomsQueryDto implements FreeRoomsQuery {
  @IsDay()
  date: string;

  @Matches(CLOCK, { message: CLOCK_MESSAGE })
  startTime: string;

  @Matches(CLOCK, { message: CLOCK_MESSAGE })
  endTime: string;

  @IsOptional()
  @IsUUID()
  classId?: string;

  @IsOptional()
  @IsUUID()
  ignoreSlotId?: string;
}

/* Responses ------------------------------------------------------------------------------------ */

export class TimetableSlotDto implements SlotContract {
  id: string;
  classSubjectId: string;
  classId: string;
  classLabel: string;
  subjectId: string;
  subjectName: string;
  teacherId: string;
  teacherName: string;
  @ApiProperty({ type: String, nullable: true })
  roomId: string | null;
  @ApiProperty({ type: String, nullable: true })
  roomName: string | null;
  activityTypeId: string;
  activityType: ActivityTypeSummaryDto;
  weekday: number;
  startTime: string;
  endTime: string;
  validFrom: string;
  validTo: string;
  @ApiProperty({ enum: WEEK_PARITIES, nullable: true })
  weekParity: WeekParity | null;
  @ApiProperty({ type: String, nullable: true })
  division: string | null;
  @ApiProperty({ type: String, nullable: true })
  groupId: string | null;
  @ApiProperty({ type: String, nullable: true })
  groupLabel: string | null;
}

export class SlotExceptionDto implements SlotExceptionContract {
  id: string;
  slotId: string;
  date: string;
  @ApiProperty({ enum: SLOT_EXCEPTION_KINDS })
  kind: SlotExceptionKind;
  @ApiProperty({ type: String, nullable: true })
  newDate: string | null;
  @ApiProperty({ type: String, nullable: true })
  newStart: string | null;
  @ApiProperty({ type: String, nullable: true })
  newEnd: string | null;
  @ApiProperty({ type: String, nullable: true })
  newRoomId: string | null;
  @ApiProperty({ type: String, nullable: true })
  newTeacherId: string | null;
  reason: string;
}

export class TimetableWarningDto implements WarningContract {
  @ApiProperty({ enum: TIMETABLE_WARNING_CODES })
  code: TimetableWarningCode;
  slotId: string;
  @ApiProperty({ type: String, nullable: true })
  date: string | null;
  message: string;
}

export class TimetableConflictDto implements ConflictContract {
  @ApiProperty({ enum: ['room', 'teacher', 'class'] })
  kind: TimetableConflictKind;
  resourceId: string;
  date: string;
  startTime: string;
  endTime: string;
  message: string;
  count: number;
  @ApiProperty({ enum: ['slot', 'exception', 'event'] })
  withSource: 'slot' | 'exception' | 'event';
  @ApiProperty({ type: String, nullable: true })
  withId: string | null;
  @ApiProperty({ type: String, nullable: true })
  withSlotId: string | null;
  withLabel: string;
}

export class TimetableWriteResultDto implements WriteResultContract {
  @ApiProperty({ type: TimetableSlotDto, nullable: true })
  slot: TimetableSlotDto | null;
  @ApiProperty({ type: TimetableSlotDto, nullable: true })
  endedSlot: TimetableSlotDto | null;
  @ApiProperty({ type: SlotExceptionDto, nullable: true })
  exception: SlotExceptionDto | null;
  @ApiProperty({ type: () => [TimetableWarningDto] })
  warnings: readonly TimetableWarningDto[];
}

export class TimetableRoomSuggestionDto implements RoomSuggestionContract {
  @ApiProperty({ enum: ['room'] })
  kind: 'room';
  @ApiProperty({ enum: TIMETABLE_SUGGESTION_TARGETS })
  target: TimetableSuggestionTarget;
  roomId: string;
  roomName: string;
  @ApiProperty({ type: Number, nullable: true })
  capacity: number | null;
  @ApiProperty({ enum: ROOM_KINDS })
  roomKind: RoomKind;
  label: string;
}

export class TimetableTimeSuggestionDto implements TimeSuggestionContract {
  @ApiProperty({ enum: ['time'] })
  kind: 'time';
  @ApiProperty({ enum: TIMETABLE_SUGGESTION_TARGETS })
  target: TimetableSuggestionTarget;
  @ApiProperty({ type: String, nullable: true })
  date: string | null;
  weekday: number;
  startTime: string;
  endTime: string;
  label: string;
}

@ApiExtraModels(TimetableRoomSuggestionDto, TimetableTimeSuggestionDto)
export class TimetableCheckResultDto implements CheckResultContract {
  @ApiProperty({ type: () => [TimetableConflictDto] })
  conflicts: readonly TimetableConflictDto[];
  @ApiProperty({ type: () => [TimetableWarningDto] })
  warnings: readonly TimetableWarningDto[];
  canSave: boolean;
  @ApiProperty({
    type: 'array',
    items: {
      oneOf: [
        { $ref: getSchemaPath(TimetableRoomSuggestionDto) },
        { $ref: getSchemaPath(TimetableTimeSuggestionDto) },
      ],
    },
  })
  suggestions: readonly (TimetableRoomSuggestionDto | TimetableTimeSuggestionDto)[];
}

export class SessionValuesDto implements SessionValuesContract {
  date: string;
  startTime: string;
  endTime: string;
  @ApiProperty({ type: String, nullable: true })
  roomId: string | null;
  @ApiProperty({ type: String, nullable: true })
  roomName: string | null;
  teacherId: string;
  teacherName: string;
}

export class TimetableOccurrenceDto implements OccurrenceContract {
  key: string;
  slotId: string;
  originalDate: string;
  @ApiProperty({
    enum: ['normal', 'cancelled', 'moved', 'moved_from', 'substitute', 'room_change'],
  })
  status: OccurrenceStatus;
  current: SessionValuesDto;
  original: SessionValuesDto;
  @ApiProperty({ enum: ['date', 'time', 'room', 'teacher'], isArray: true })
  changes: readonly SessionChange[];
  @ApiProperty({ type: SessionValuesDto, nullable: true })
  movedTo: SessionValuesDto | null;
  @ApiProperty({ type: String, nullable: true })
  exceptionId: string | null;
  reason: string;
  classId: string;
  classLabel: string;
  subjectId: string;
  subjectName: string;
  activityType: ActivityTypeSummaryDto;
  @ApiProperty({ type: String, nullable: true })
  division: string | null;
  @ApiProperty({ type: String, nullable: true })
  groupId: string | null;
  @ApiProperty({ type: String, nullable: true })
  groupLabel: string | null;
  canChange: boolean;
}

export class FreeRoomDto implements FreeRoomContract {
  id: string;
  name: string;
  @ApiProperty({ type: Number, nullable: true })
  capacity: number | null;
  @ApiProperty({ enum: ROOM_KINDS })
  kind: RoomKind;
  active: boolean;
  fitsClass: boolean;
}
