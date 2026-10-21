import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import {
  ACTIVITY_COLOURS,
  ACTIVITY_ICONS,
  ACTIVITY_TYPE_LIMITS,
  type ActivityColour,
  type ActivityIcon,
  type ActivityTypeDto as ActivityTypeContract,
  type ActivityTypeListQuery,
  type ActivityTypeSummary,
  type CreateActivityTypeRequest,
  type UpdateActivityTypeRequest,
} from '@cdls/shared';
import { queryBoolean, trim } from '../../common/transforms.js';

export class ActivityTypeSummaryDto implements ActivityTypeSummary {
  id: string;
  code: string;
  label: string;
  @ApiProperty({ enum: ACTIVITY_COLOURS })
  colour: ActivityColour;
  @ApiProperty({ enum: ACTIVITY_ICONS })
  icon: ActivityIcon;
  gradable: boolean;
  repeatable: boolean;
  homework: boolean;
}

export class ActivityTypeDto extends ActivityTypeSummaryDto implements ActivityTypeContract {
  isSystem: boolean;
  @ApiProperty({ type: String, nullable: true })
  ownerTeacherId: string | null;
  @ApiProperty({ type: String, nullable: true })
  ownerName: string | null;
  archived: boolean;
}

export class ActivityTypeListQueryDto implements ActivityTypeListQuery {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(queryBoolean)
  @IsBoolean()
  includeArchived?: boolean;
}

export class CreateActivityTypeDto implements CreateActivityTypeRequest {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(ACTIVITY_TYPE_LIMITS.label)
  label: string;

  /** A token of the accessible palette, never a hex value. */
  @ApiProperty({ enum: ACTIVITY_COLOURS })
  @IsIn(ACTIVITY_COLOURS)
  colour: ActivityColour;

  @ApiProperty({ enum: ACTIVITY_ICONS })
  @IsIn(ACTIVITY_ICONS)
  icon: ActivityIcon;

  /** Grades can be entered for it (it then belongs to a period). */
  @IsBoolean()
  gradable: boolean;

  /** Can repeat every week. */
  @IsBoolean()
  repeatable: boolean;

  /** Homework students tick as done; never weekly. */
  @IsBoolean()
  homework: boolean;
}

export class UpdateActivityTypeDto
  extends PartialType(CreateActivityTypeDto)
  implements UpdateActivityTypeRequest
{
  @IsOptional()
  @IsBoolean()
  archived?: boolean;
}
