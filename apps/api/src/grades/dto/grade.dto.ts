import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
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
  ValidateNested,
} from 'class-validator';
import {
  type GradeDto as GradeContract,
  type GradeEntry,
  type GradeSheetDto as GradeSheetContract,
  LIMITS,
  type PublishGradesRequest,
  type SaveGradesRequest,
  type StudentGradeDto as StudentGradeContract,
  type StudentGradesDto as StudentGradesContract,
} from '@cdls/shared';
import { StudentSummaryDto } from '../../classes/dto/class.dto.js';
import { IsDay } from '../../common/dates.js';
import { EventDto } from '../../events/dto/event.dto.js';

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
  kind: EventDto['kind'];
  title: string;
  date: string;
  subjectId: string | null;
  coefficient: number;
}

export class StudentGradeDto implements StudentGradeContract {
  grade: GradeDto;
  event: GradedEventDto;
}

class SubjectGradesDto {
  subjectId: string;
  @ApiProperty({ type: Number, nullable: true })
  average: number | null;
  @ApiProperty({ type: [StudentGradeDto] })
  grades: StudentGradeDto[];
}

export class StudentGradesDto implements StudentGradesContract {
  studentId: string;
  @ApiProperty({ type: [SubjectGradesDto] })
  subjects: SubjectGradesDto[];
}

export class StudentGradesQueryDto {
  /** Only grades of events in this term. */
  @IsOptional()
  @IsUUID()
  termId?: string;

  @IsOptional()
  @IsDay()
  from?: string;

  @IsOptional()
  @IsDay()
  to?: string;
}
