import { Transform, Type } from 'class-transformer';
import { IsInt, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import type {
  CreateSchoolYearRequest,
  CreateTermRequest,
  SchoolYearDto as SchoolYearContract,
  TermDto as TermContract,
} from '@cdls/shared';
import { IsDay } from '../../common/dates.js';
import { trim } from '../../common/transforms.js';

export class TermDto implements TermContract {
  id: string;
  schoolYearId: string;
  number: number;
  label: string;
  startsOn: string;
  endsOn: string;
  closedAt: string | null;
}

export class SchoolYearDto implements SchoolYearContract {
  id: string;
  label: string;
  startsOn: string;
  endsOn: string;
  isCurrent: boolean;
  terms: TermDto[];
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

export class CreateTermDto implements CreateTermRequest {
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
