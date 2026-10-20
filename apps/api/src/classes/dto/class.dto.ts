import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
import type {
  ClassDto as ClassContract,
  CreateClassRequest,
  EnrollmentDto as EnrollmentContract,
  SectionDto as SectionContract,
  SectionId,
  StudentSummaryDto as StudentSummaryContract,
} from '@cdls/shared';
import { trim } from '../../common/transforms.js';

export class SectionDto implements SectionContract {
  id: string;
  code: SectionId;
  label: string;
}

export class ClassDto implements ClassContract {
  id: string;
  schoolYearId: string;
  sectionId: string;
  sectionCode: SectionId;
  code: string;
  label: string;
  studentCount: number;
}

export class StudentSummaryDto implements StudentSummaryContract {
  /** Student id (not the user id). */
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  studentNumber: string | null;
}

export class EnrollmentDto implements EnrollmentContract {
  id: string;
  studentId: string;
  classId: string;
  schoolYearId: string;
  enrolledOn: string;
  leftOn: string | null;
}

export class ClassListQueryDto {
  /** Defaults to the current school year. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  schoolYearId?: string;
}

export class CreateClassDto implements CreateClassRequest {
  @IsUUID()
  schoolYearId: string;

  @IsUUID()
  sectionId: string;

  /** Matches CLASSES in packages/shared, e.g. `premiere`. */
  @Matches(/^[a-z0-9-]{1,40}$/)
  code: string;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  label: string;
}

export class UpdateClassDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  label: string;
}

export class EnrollStudentDto {
  @IsUUID()
  studentId: string;
}
