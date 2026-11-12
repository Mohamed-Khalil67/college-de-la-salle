import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  type CreateQuickAssessmentRequest,
  EVENT_LIMITS,
  type GradeDto as GradeContract,
  type GradeEntry,
  type GradeSheetDto as GradeSheetContract,
  LIMITS,
  type PendingGradingDto as PendingGradingContract,
  type PendingGradingQuery,
  type PublishGradesRequest,
  type SaveGradesRequest,
  type StudentGradeDto as StudentGradeContract,
  type StudentGradesDto as StudentGradesContract,
  type StudentGradesQuery,
} from '@cdls/shared';
import { StudentSummaryDto } from '../../classes/dto/class.dto.js';
import { IsDay } from '../../common/dates.js';
import { ActivityTypeSummaryDto } from '../../activity-types/dto/activity-type.dto.js';
import { EventDto } from '../../events/dto/event.dto.js';
import { trim } from '../../common/transforms.js';

export class GradeDto implements GradeContract {
  id: string;
  eventId: string;
  studentId: string;
  score: number;
  outOf: number;
  comment: string;
  published: boolean;
  updatedAt: string;
}

class GradeSheetRowDto {
  student: StudentSummaryDto;
  @ApiProperty({ type: GradeDto, nullable: true })
  grade: GradeDto | null;
  /** False: graded, but no longer concerned (left the group); only removing the grade is allowed. */
  targeted: boolean;
}

export class GradeSheetDto implements GradeSheetContract {
  event: EventDto;
  @ApiProperty({ type: [GradeSheetRowDto] })
  rows: GradeSheetRowDto[];
}

export class GradeEntryDto implements GradeEntry {
  @IsUUID()
  studentId: string;

  /** null removes the grade. */
  @ApiProperty({ type: Number, nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1000)
  score: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(LIMITS.comment)
  comment?: string;
}

export class SaveGradesDto implements SaveGradesRequest {
  /** Defaults to 20 (or the event's current scale). */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(1000)
  outOf?: number;

  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => GradeEntryDto)
  entries: GradeEntryDto[];
}

export class PublishGradesDto implements PublishGradesRequest {
  @IsBoolean()
  published: boolean;
}

class GradedEventDto {
  id: string;
  type: ActivityTypeSummaryDto;
  title: string;
  date: string;
  subjectId: string | null;
  coefficient: number;
  @ApiProperty({ type: String, nullable: true })
  periodId: string | null;
}

export class StudentGradeDto implements StudentGradeContract {
  grade: GradeDto;
  event: GradedEventDto;
}

class SubjectGradesDto {
  subjectId: string;
  @ApiProperty({ type: Number, nullable: true })
  average: number | null;
  /** Weight in the class's general average (report card); null when the class has no such subject. */
  @ApiProperty({ type: Number, nullable: true })
  coefficient: number | null;
  @ApiProperty({ type: [StudentGradeDto] })
  grades: StudentGradeDto[];
}

export class StudentGradesDto implements StudentGradesContract {
  studentId: string;
  @ApiProperty({ type: [SubjectGradesDto] })
  subjects: SubjectGradesDto[];
}

export class StudentGradesQueryDto implements StudentGradesQuery {
  /** Only the grades of events counted in this period (also picks the school year's class subjects). */
  @IsOptional()
  @IsUUID()
  periodId?: string;

  @IsOptional()
  @IsDay()
  from?: string;

  @IsOptional()
  @IsDay()
  to?: string;
}

/** « Nouvelle note »: the gradable event is made behind the scenes (today, whole class, current period). */
export class CreateQuickAssessmentDto implements CreateQuickAssessmentRequest {
  @IsUUID()
  classId: string;

  /** A subject of the class that the teacher teaches (GET /teaching-assignments). */
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  subjectId: string;

  /** The name the students will see, e.g. « Interrogation 3 ». */
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Donnez un nom à la note.' })
  @MaxLength(EVENT_LIMITS.title, {
    message: `Le nom ne doit pas dépasser ${EVENT_LIMITS.title} caractères.`,
  })
  title: string;

  /** Weight of the grades, 1 by default. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(20)
  coefficient?: number;

  /** A gradable, non-homework type the teacher may use; omitted, the first assessment type. */
  @IsOptional()
  @IsUUID()
  activityTypeId?: string;
}

export class PendingGradingQueryDto implements PendingGradingQuery {
  @IsUUID()
  classId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(40)
  subjectId: string;
}

export class PendingGradingDto implements PendingGradingContract {
  event: EventDto;
  entered: number;
  total: number;
  published: boolean;
  @ApiProperty({ type: Number, nullable: true })
  outOf: number | null;
}
