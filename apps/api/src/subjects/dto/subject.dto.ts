import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  type CreateSubjectRequest,
  SECTION_IDS,
  type SectionId,
  type SubjectDto as SubjectContract,
  SUBJECT_LIMITS,
  type SubjectListQuery,
  type UpdateSubjectRequest,
} from '@cdls/shared';
import { queryBoolean, trim } from '../../common/transforms.js';

export class SubjectDto implements SubjectContract {
  /** Stable slug made from the name at creation (`mathematiques`). */
  id: string;
  name: string;
  group: string;
  @ApiProperty({ enum: SECTION_IDS, isArray: true })
  sections: SectionId[];
  archived: boolean;
}

export class SubjectListQueryDto implements SubjectListQuery {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(queryBoolean)
  @IsBoolean()
  includeArchived?: boolean;
}

export class CreateSubjectDto implements CreateSubjectRequest {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(SUBJECT_LIMITS.name)
  name: string;

  /** Display group (« Sciences »…). */
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(SUBJECT_LIMITS.group)
  group: string;

  @ApiProperty({ enum: SECTION_IDS, isArray: true })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsIn(SECTION_IDS, { each: true })
  sections: SectionId[];
}

export class UpdateSubjectDto implements UpdateSubjectRequest {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(SUBJECT_LIMITS.name)
  name?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(SUBJECT_LIMITS.group)
  group?: string;

  @ApiPropertyOptional({ enum: SECTION_IDS, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsIn(SECTION_IDS, { each: true })
  sections?: SectionId[];

  /** Archived subjects can't be added to a class; they stay on past grades. */
  @IsOptional()
  @IsBoolean()
  archived?: boolean;
}
