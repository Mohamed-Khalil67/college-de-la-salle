import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  CALENDAR_DAY_LIMITS,
  CALENDAR_DAY_TYPES,
  type CalendarDayDto as CalendarDayContract,
  type CalendarDayQuery,
  type CalendarDayType,
  type CreateCalendarDayRequest,
  type UpdateCalendarDayRequest,
} from '@cdls/shared';
import { IsDay } from '../../common/dates.js';
import { emptyToNull, trim } from '../../common/transforms.js';

export class CalendarDayDto implements CalendarDayContract {
  id: string;
  schoolYearId: string;
  @ApiProperty({ enum: CALENDAR_DAY_TYPES })
  type: CalendarDayType;
  label: string;
  startsOn: string;
  endsOn: string;
  @ApiProperty({ type: String, nullable: true })
  sectionId: string | null;
  classIds: string[];
}

export class CalendarDayQueryDto implements CalendarDayQuery {
  @IsOptional()
  @IsUUID()
  schoolYearId?: string;

  /** Days that end on or after this day. */
  @IsOptional()
  @IsDay()
  from?: string;

  /** Days that start on or before this day. */
  @IsOptional()
  @IsDay()
  to?: string;
}

export class CreateCalendarDayDto implements CreateCalendarDayRequest {
  @IsUUID()
  schoolYearId: string;

  @ApiProperty({ enum: CALENDAR_DAY_TYPES })
  @IsIn(CALENDAR_DAY_TYPES)
  type: CalendarDayType;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(CALENDAR_DAY_LIMITS.label)
  label: string;

  @IsDay()
  startsOn: string;

  /** Included; the same as startsOn for a single day. */
  @IsDay()
  endsOn: string;

  /** Omit for the whole school. */
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @Transform(emptyToNull)
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  sectionId?: string | null;

  /** Limits the day to these classes. */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(CALENDAR_DAY_LIMITS.classes)
  @IsUUID('all', { each: true })
  classIds?: string[];
}

export class UpdateCalendarDayDto
  extends PartialType(OmitType(CreateCalendarDayDto, ['schoolYearId'] as const))
  implements UpdateCalendarDayRequest {}
