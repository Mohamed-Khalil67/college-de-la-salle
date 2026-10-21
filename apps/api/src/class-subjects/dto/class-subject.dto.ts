import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import type {
  ClassSubjectDto as ClassSubjectContract,
  CopyClassSubjectsRequest,
  CreateClassSubjectRequest,
  UpdateClassSubjectRequest,
} from '@cdls/shared';

export class ClassSubjectTeacherDto {
  assignmentId: string;
  teacherId: string;
  teacherName: string;
}

export class ClassSubjectDto implements ClassSubjectContract {
  id: string;
  classId: string;
  subjectId: string;
  subjectName: string;
  coefficient: number;
  @ApiProperty({ type: Number, nullable: true })
  hoursPerWeek: number | null;
  @ApiProperty({ type: [ClassSubjectTeacherDto] })
  teachers: ClassSubjectTeacherDto[];
}

export class CreateClassSubjectDto implements CreateClassSubjectRequest {
  @IsString()
  @MaxLength(40)
  subjectId: string;

  /** Weight in the class's general average, 1 by default. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(20)
  coefficient?: number;

  @ApiProperty({ type: Number, nullable: true, required: false })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(40)
  hoursPerWeek?: number | null;
}

export class UpdateClassSubjectDto implements UpdateClassSubjectRequest {
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(20)
  coefficient?: number;

  @ApiProperty({ type: Number, nullable: true, required: false })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(40)
  hoursPerWeek?: number | null;
}

export class CopyClassSubjectsDto implements CopyClassSubjectsRequest {
  @IsUUID()
  fromClassId: string;
}
