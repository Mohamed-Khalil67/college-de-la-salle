import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import type {
  ReportCardBatchRequest,
  ReportCardBatchResponse,
  ReportCardDto as ReportCardContract,
  ReportCardSubjectDto as ReportCardSubjectContract,
} from '@cdls/shared';

export class ReportCardSubjectDto implements ReportCardSubjectContract {
  subjectId: string;
  subjectName: string;
  coefficient: number;
  @ApiProperty({ type: Number, nullable: true })
  average: number | null;
  gradeCount: number;
}

export class ReportCardDto implements ReportCardContract {
  id: string;
  studentId: string;
  studentName: string;
  termId: string;
  classId: string;
  @ApiProperty({ type: Number, nullable: true })
  average: number | null;
  @ApiProperty({ type: Number, nullable: true })
  rank: number | null;
  appreciation: string;
  @ApiProperty({ type: [ReportCardSubjectDto] })
  subjects: ReportCardSubjectDto[];
  generatedAt: string;
  publishedAt: string | null;
}

export class ReportCardBatchDto implements ReportCardBatchRequest {
  /** Omit for every class of the term's school year. */
  @IsOptional()
  @IsUUID()
  classId?: string;
}

export class ReportCardBatchResultDto implements ReportCardBatchResponse {
  count: number;
}

export class ReportCardListQueryDto {
  @IsOptional()
  @IsUUID()
  classId?: string;
}

export class UpdateReportCardDto {
  /** The class council's appreciation, printed on the report card. */
  @IsString()
  @MaxLength(2000)
  appreciation: string;
}
