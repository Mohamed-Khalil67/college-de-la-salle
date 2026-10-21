import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import {
  type ApproveSectionChangeRequest,
  type CreateSectionChangeRequest,
  type RejectSectionChangeRequest,
  SECTION_CHANGE_LIMITS,
  SECTION_CHANGE_STATUSES,
  type SectionChangeListQuery,
  type SectionChangeRequestDto as SectionChangeContract,
  type SectionChangeStatus,
  type SectionId,
} from '@cdls/shared';
import { PaginationQueryDto } from '../../common/pagination.js';
import { trim } from '../../common/transforms.js';

const SECTIONS: readonly SectionId[] = ['nationale', 'bac'];

export class SectionChangeDto implements SectionChangeContract {
  id: string;
  studentId: string;
  studentFirstName: string;
  studentLastName: string;
  studentEmail: string;
  @ApiProperty({ type: String, nullable: true })
  currentClassLabel: string | null;
  @ApiProperty({ enum: SECTIONS })
  fromSection: SectionId;
  @ApiProperty({ enum: SECTIONS })
  toSection: SectionId;
  reason: string;
  @ApiProperty({ enum: SECTION_CHANGE_STATUSES })
  status: SectionChangeStatus;
  requestedByName: string;
  requestedByStudent: boolean;
  createdAt: string;
  @ApiProperty({ type: String, nullable: true })
  decidedAt: string | null;
  @ApiProperty({ type: String, nullable: true })
  decidedByName: string | null;
  decisionNote: string;
  @ApiProperty({ type: String, nullable: true })
  newClassLabel: string | null;
}

export class SectionChangeListQueryDto extends PaginationQueryDto implements SectionChangeListQuery {
  @ApiPropertyOptional({ enum: SECTION_CHANGE_STATUSES })
  @IsOptional()
  @IsIn(SECTION_CHANGE_STATUSES)
  status?: SectionChangeStatus;
}

export class CreateSectionChangeDto implements CreateSectionChangeRequest {
  /** Admins: the student (not the user) concerned. Students leave it out. */
  @IsOptional()
  @IsUUID()
  studentId?: string;

  @ApiProperty({ enum: SECTIONS })
  @IsIn(SECTIONS)
  toSection: SectionId;

  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Expliquez la raison de la demande.' })
  @MaxLength(SECTION_CHANGE_LIMITS.reason)
  reason: string;
}

export class ApproveSectionChangeDto implements ApproveSectionChangeRequest {
  /** A class of the new section, in the current school year. */
  @IsUUID()
  classId: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(SECTION_CHANGE_LIMITS.note)
  note?: string;
}

export class RejectSectionChangeDto implements RejectSectionChangeRequest {
  /** Shown to the student. */
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Indiquez la raison du refus.' })
  @MaxLength(SECTION_CHANGE_LIMITS.note)
  note: string;
}
