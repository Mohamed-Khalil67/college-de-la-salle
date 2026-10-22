import { IsOptional, IsUUID } from 'class-validator';
import type {
  CreateTeachingAssignmentRequest,
  TeachingAssignmentDto as TeachingAssignmentContract,
} from '@cdls/shared';

export class TeachingAssignmentDto implements TeachingAssignmentContract {
  id: string;
  teacherId: string;
  teacherName: string;
  classSubjectId: string;
  classId: string;
  classLabel: string;
  subjectId: string;
  subjectName: string;
  /** The class subject's coefficient. */
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

  /** A subject of the class (POST /classes/:id/subjects first). */
  @IsUUID()
  classSubjectId: string;
}
