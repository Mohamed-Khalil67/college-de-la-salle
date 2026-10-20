import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import type {
  CreateTeachingAssignmentRequest,
  TeachingAssignmentDto as TeachingAssignmentContract,
} from '@cdls/shared';

export class TeachingAssignmentDto implements TeachingAssignmentContract {
  id: string;
  teacherId: string;
  teacherName: string;
  classId: string;
  classLabel: string;
  subjectId: string;
  subjectName: string;
  coefficient: number;
}

export class TeachingAssignmentQueryDto {
  @IsOptional()
  @IsUUID()
  teacherId?: string;

  @IsOptional()
  @IsUUID()
  classId?: string;
}

export class CreateTeachingAssignmentDto implements CreateTeachingAssignmentRequest {
  @IsUUID()
  teacherId: string;

  @IsUUID()
  classId: string;

  @IsString()
  @MaxLength(40)
  subjectId: string;

  /** Weight of the subject in the class's general average. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(20)
  coefficient?: number;
}
