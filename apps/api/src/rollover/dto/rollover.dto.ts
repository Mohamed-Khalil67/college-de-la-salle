import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import {
  ROLLOVER_LIMITS,
  ROLLOVER_STUDENT_ACTIONS,
  type RolloverApplyRequest,
  type RolloverClassPlan,
  type RolloverIssue,
  type RolloverPreview,
  type RolloverRequest,
  type RolloverResult,
  type RolloverSkipReason,
  type RolloverStepId,
  type RolloverStepSummary,
  type RolloverStudentAction,
  type RolloverStudentOverride,
  type RolloverStudentPlan,
  type SectionId,
} from '@cdls/shared';
import { IsDay } from '../../common/dates.js';

export class RolloverOverrideDto implements RolloverStudentOverride {
  @IsUUID()
  studentId: string;

  @ApiProperty({ enum: ROLLOVER_STUDENT_ACTIONS })
  @IsIn(ROLLOVER_STUDENT_ACTIONS)
  action: RolloverStudentAction;
}

export class RolloverRequestDto implements RolloverRequest {
  @IsUUID()
  sourceYearId: string;

  /** @example 2027-2028 */
  /** Empty counts as not given: the label then defaults to the source year's next one. */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || undefined : value,
  )
  @Matches(/^\d{4}-\d{4}$/)
  label?: string;

  @IsOptional()
  @IsDay()
  startsOn?: string;

  @IsOptional()
  @IsDay()
  endsOn?: string;

  @IsBoolean()
  copyAssignments: boolean;

  @IsBoolean()
  copyTimetable: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(ROLLOVER_LIMITS.overrides)
  @ValidateNested({ each: true })
  @Type(() => RolloverOverrideDto)
  overrides?: RolloverOverrideDto[];

  @IsOptional()
  @IsDay()
  leavesOn?: string;
}

export class RolloverApplyDto extends RolloverRequestDto implements RolloverApplyRequest {
  @IsString()
  @MaxLength(64)
  @Matches(/^[0-9a-f]{64}$/)
  planHash: string;
}

export class RolloverStepSummaryDto implements RolloverStepSummary {
  id: RolloverStepId;
  label: string;
  create: number;
  existing: number;
  skipped: number;
}

export class RolloverIssueDto implements RolloverIssue {
  step: RolloverStepId;
  @ApiProperty({ enum: ['warning', 'conflict'] })
  level: 'warning' | 'conflict';
  message: string;
}

export class RolloverClassPlanDto implements RolloverClassPlan {
  sourceClassId: string;
  sectionCode: SectionId;
  code: string;
  label: string;
  nextLabel: string | null;
  studentCount: number;
  @ApiProperty({ enum: ['create', 'exists'] })
  action: 'create' | 'exists';
  targetClassId: string | null;
}

export class RolloverStudentPlanDto implements RolloverStudentPlan {
  studentId: string;
  firstName: string;
  lastName: string;
  studentNumber: string | null;
  sectionCode: SectionId;
  sourceClassId: string;
  sourceClassLabel: string;
  @ApiProperty({ enum: ROLLOVER_STUDENT_ACTIONS })
  defaultAction: RolloverStudentAction;
  @ApiProperty({ enum: ROLLOVER_STUDENT_ACTIONS })
  action: RolloverStudentAction;
  targetClassLabel: string | null;
  @ApiProperty({ enum: ['already_enrolled'], nullable: true })
  skipped: RolloverSkipReason | null;
}

class RolloverYearRefDto {
  id: string;
  label: string;
  archived: boolean;
}

class RolloverNewYearDto {
  label: string;
  startsOn: string;
  endsOn: string;
  exists: boolean;
}

export class RolloverPreviewDto implements RolloverPreview {
  planHash: string;
  sourceYear: RolloverYearRefDto;
  newYear: RolloverNewYearDto;
  @ApiProperty({ type: [RolloverStepSummaryDto] })
  steps: RolloverStepSummaryDto[];
  @ApiProperty({ type: [RolloverIssueDto] })
  issues: RolloverIssueDto[];
  @ApiProperty({ type: [RolloverClassPlanDto] })
  classes: RolloverClassPlanDto[];
  @ApiProperty({ type: [RolloverStudentPlanDto] })
  students: RolloverStudentPlanDto[];
  archivesSourceYear: boolean;
  makesNewYearCurrent: boolean;
}

export class RolloverResultDto implements RolloverResult {
  schoolYearId: string;
  schoolYearLabel: string;
  @ApiProperty({ type: [RolloverStepSummaryDto] })
  steps: RolloverStepSummaryDto[];
  @ApiProperty({ type: [RolloverIssueDto] })
  issues: RolloverIssueDto[];
  @ApiProperty({ type: [RolloverClassPlanDto] })
  classes: RolloverClassPlanDto[];
  @ApiProperty({ type: 'object', additionalProperties: { type: 'number' } })
  studentCounts: Record<RolloverStudentAction, number>;
  nothingToDo: boolean;
}
