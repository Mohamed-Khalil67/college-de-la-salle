import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  type AssessmentTargetDto as AssessmentTargetContract,
  type AssessmentTargetGroupDto as AssessmentTargetGroupContract,
  type AssessmentTargetInput,
  type Attachment,
  EVENT_LIMITS,
  type EventDto as EventContract,
  type EventInput,
  type EventRangeQuery,
  type OccurrenceDto as OccurrenceContract,
} from '@cdls/shared';
import { IsDay } from '../../common/dates.js';
import { ActivityTypeSummaryDto } from '../../activity-types/dto/activity-type.dto.js';
import { emptyToNull, trim } from '../../common/transforms.js';

const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

export class AttachmentDto implements Attachment {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(EVENT_LIMITS.label)
  label: string;

  /** https only (YouTube and Google Drive links are embedded by the web app). */
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(500)
  url: string;
}

export class AssessmentTargetGroupDto implements AssessmentTargetGroupContract {
  id: string;
  division: string;
  label: string;
}

export class AssessmentTargetDto implements AssessmentTargetContract {
  whole: boolean;
  @ApiProperty({ type: [AssessmentTargetGroupDto] })
  groups: readonly AssessmentTargetGroupDto[];
  studentIds: readonly string[];
  @ApiProperty({ type: Number, nullable: true })
  concerned: number | null;
}

export class AssessmentTargetInputDto implements AssessmentTargetInput {
  /** Groups of the event's class (GET /groups?classId=). */
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID(undefined, { each: true })
  groupIds: string[];

  /** Students enrolled in the event's class. */
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID(undefined, { each: true })
  studentIds: string[];
}

export class EventDto implements EventContract {
  id: string;
  activityTypeId: string;
  type: ActivityTypeSummaryDto;
  title: string;
  subjectId: string | null;
  classId: string | null;
  sectionId: string | null;
  date: string;
  startTime: string | null;
  endTime: string | null;
  repeatUntil: string | null;
  @ApiProperty({ type: String, nullable: true })
  roomId: string | null;
  @ApiProperty({ type: String, nullable: true })
  roomName: string | null;
  place: string;
  @ApiProperty({ type: String, nullable: true })
  periodId: string | null;
  description: string;
  @ApiProperty({ type: [AttachmentDto] })
  attachments: AttachmentDto[];
  coefficient: number;
  target: AssessmentTargetDto;
  authorId: string;
  authorName: string;
  createdAt: string;
  updatedAt: string;
}

export class OccurrenceDto implements OccurrenceContract {
  /** `eventId@day` */
  key: string;
  day: string;
  event: EventDto;
}

/** Audience: classId → one class; only sectionId → a section; neither → the whole school. */
export class CreateEventDto implements EventInput {
  /** A school-wide type or one of the author's own (GET /activity-types). */
  @IsUUID()
  activityTypeId: string;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(EVENT_LIMITS.title)
  title: string;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(40)
  subjectId?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsUUID()
  classId?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsUUID()
  sectionId?: string | null;

  @IsDay()
  date: string;

  /** HH:MM; omit for an all-day event. */
  @IsOptional()
  @Transform(emptyToNull)
  @Matches(CLOCK)
  startTime?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @Matches(CLOCK)
  endTime?: string | null;

  /** Repeats every week until this day (repeatable types only). */
  @IsOptional()
  @Transform(emptyToNull)
  @IsDay()
  repeatUntil?: string | null;

  /** A room of the school (GET /rooms). */
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @Transform(emptyToNull)
  @IsUUID()
  roomId?: string | null;

  /** Free text, for places outside the school. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(EVENT_LIMITS.place)
  place?: string;

  /** Gradable types: the period its grades count for (default: the period containing the date). */
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @Transform(emptyToNull)
  @IsUUID()
  periodId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(EVENT_LIMITS.description)
  description?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(EVENT_LIMITS.attachments)
  @ValidateNested({ each: true })
  @Type(() => AttachmentDto)
  attachments?: AttachmentDto[];

  /** Weight of the grades given for it (gradable types), 1 by default. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(20)
  coefficient?: number;

  /**
   * « Assigner à » (assessments and homework of a class): omitted, the whole class on create and
   * unchanged on update; both lists empty, the whole class.
   */
  @ApiPropertyOptional({ type: AssessmentTargetInputDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AssessmentTargetInputDto)
  target?: AssessmentTargetInputDto;
}

export class UpdateEventDto extends PartialType(CreateEventDto) {}

export class EventRangeQueryDto implements EventRangeQuery {
  @IsDay()
  from: string;

  @IsDay()
  to: string;

  /** Staff only: a class (also shows its section's and the whole school's events). */
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  classId?: string;

  /** Staff only: a section (also shows its classes' and the whole school's events). */
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  sectionId?: string;
}
