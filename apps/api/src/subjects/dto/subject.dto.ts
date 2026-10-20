import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import type { SubjectDto as SubjectContract } from '@cdls/shared';
import { trim } from '../../common/transforms.js';

export class SubjectDto implements SubjectContract {
  /** Stable slug from MATIERES in packages/shared. */
  id: string;
  name: string;
  group: string;
}

export class UpdateSubjectDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  group?: string;
}
