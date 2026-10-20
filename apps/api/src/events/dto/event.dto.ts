import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
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
  type Attachment,
  EVENT_KINDS,
  EVENT_LIMITS,
  type EventDto as EventContract,
  type EventInput,
  type EventKind,
  type EventRangeQuery,
  type OccurrenceDto as OccurrenceContract,
} from '@cdls/shared';
import { IsDay } from '../../common/dates.js';
import { emptyToNull, trim } from '../../common/transforms.js';

const KINDS = EVENT_KINDS.map((k) => k.id);
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

export class EventDto implements EventContract {
  id: string;
  @ApiProperty({ enum: KINDS })
  kind: EventKind;
  title: string;
  subjectId: string | null;
  classId: string | null;
  sectionId: string | null;
  date: string;
  startTime: string | null;
  endTime: string | null;
  repeatUntil: string | null;
  place: string;
  description: string;
  @ApiProperty({ type: [AttachmentDto] })
  attachments: AttachmentDto[];
  coefficient: number;
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
  @ApiProperty({ enum: KINDS })
  @IsIn(KINDS)
  kind: EventKind;

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

  /** Repeats every week until this day (repeatable kinds: cours, TD, TP, révision, activité). */
  @IsOptional()
  @Transform(emptyToNull)
  @IsDay()
  repeatUntil?: string | null;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(EVENT_LIMITS.place)
  place?: string;

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

  /** Weight of the grades given for it (gradable kinds), 1 by default. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(20)
  coefficient?: number;
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
