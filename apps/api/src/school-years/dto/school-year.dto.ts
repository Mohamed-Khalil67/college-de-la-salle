import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';
import { IsOptional } from 'class-validator';
import type {
  CreateSchoolYearRequest,
  SchoolYearDto as SchoolYearContract,
  UpdateSchoolYearRequest,
} from '@cdls/shared';
import { IsDay } from '../../common/dates.js';
import { PeriodDto } from '../../periods/dto/period.dto.js';

export class SchoolYearDto implements SchoolYearContract {
  id: string;
  label: string;
  startsOn: string;
  endsOn: string;
  isCurrent: boolean;
  @ApiProperty({ type: [PeriodDto] })
  periods: PeriodDto[];
}

export class CreateSchoolYearDto implements CreateSchoolYearRequest {
  /** @example 2027-2028 */
  @Matches(/^\d{4}-\d{4}$/)
  label: string;

  @IsDay()
  startsOn: string;

  @IsDay()
  endsOn: string;
}

export class UpdateSchoolYearDto implements UpdateSchoolYearRequest {
  @IsOptional()
  @Matches(/^\d{4}-\d{4}$/)
  label?: string;

  @IsOptional()
  @IsDay()
  startsOn?: string;

  @IsOptional()
  @IsDay()
  endsOn?: string;
}
