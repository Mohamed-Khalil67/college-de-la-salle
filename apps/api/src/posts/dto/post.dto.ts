import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { type CreatePostRequest, LIMITS, type PostDto as PostContract } from '@cdls/shared';
import { PaginationQueryDto } from '../../common/pagination.js';
import { emptyToNull, trim } from '../../common/transforms.js';

export class PostDto implements PostContract {
  id: string;
  title: string;
  body: string;
  subjectId: string | null;
  classId: string | null;
  sectionId: string | null;
  authorId: string;
  authorName: string;
  createdAt: string;
}

/** Audience: classId → one class; only sectionId → a section; neither → the whole school. */
export class CreatePostDto implements CreatePostRequest {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(LIMITS.title)
  title: string;

  @IsString()
  @MinLength(1)
  @MaxLength(LIMITS.body)
  body: string;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(40)
  subjectId?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsUUID()
  classId?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsUUID()
  sectionId?: string | null;
}

export class PostListQueryDto extends PaginationQueryDto {
  /** Staff only: posts for this class (plus its section's and the whole school's). */
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  classId?: string;
}
