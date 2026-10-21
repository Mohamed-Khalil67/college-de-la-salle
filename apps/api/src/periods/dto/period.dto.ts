import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  type CreatePeriodRequest,
  PERIOD_KINDS,
  type PeriodDto as PeriodContract,
  type PeriodKind,
  type UpdatePeriodRequest,
} from '@cdls/shared';
import { IsDay } from '../../common/dates.js';
import { emptyToNull, trim } from '../../common/transforms.js';

export class PeriodDto implements PeriodContract {
  id: string;
  schoolYearId: string;
  @ApiProperty({ enum: PERIOD_KINDS })
  kind: PeriodKind;
  @ApiProperty({ type: String, nullable: true })
  sectionId: string | null;
  number: number;
  label: string;
  startsOn: string;
  endsOn: string;
  @ApiProperty({ type: String, nullable: true })
  closedAt: string | null;
}

export class CreatePeriodDto implements CreatePeriodRequest {
  /** Defaults to trimester. */
  @ApiPropertyOptional({ enum: PERIOD_KINDS })
  @IsOptional()
  @IsIn(PERIOD_KINDS)
  kind?: PeriodKind;

  /** Omit for a period of every section. */
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @Transform(emptyToNull)
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  sectionId?: string | null;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(4)
  number: number;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  label: string;

  @IsDay()
  startsOn: string;

  @IsDay()
  endsOn: string;
}

export class UpdatePeriodDto extends PartialType(CreatePeriodDto) implements UpdatePeriodRequest {}
