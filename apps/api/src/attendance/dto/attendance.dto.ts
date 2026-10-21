import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  ATTENDANCE_STATUSES,
  type AttendanceRecordDto as AttendanceRecordContract,
  type AttendanceSheetDto as AttendanceSheetContract,
  type AttendanceStatus,
  type SaveAttendanceRequest,
  type StudentAttendanceDto as StudentAttendanceContract,
} from '@cdls/shared';
import { StudentSummaryDto } from '../../classes/dto/class.dto.js';
import { IsDay } from '../../common/dates.js';
import { ActivityTypeSummaryDto } from '../../activity-types/dto/activity-type.dto.js';
import { EventDto } from '../../events/dto/event.dto.js';

export class AttendanceRecordDto implements AttendanceRecordContract {
  id: string;
  eventId: string;
  studentId: string;
  date: string;
  @ApiProperty({ enum: ATTENDANCE_STATUSES })
  status: AttendanceStatus;
  minutesLate: number | null;
  note: string;
}

class AttendanceRowDto {
  student: StudentSummaryDto;
  @ApiProperty({ type: AttendanceRecordDto, nullable: true })
  record: AttendanceRecordDto | null;
}

export class AttendanceSheetDto implements AttendanceSheetContract {
  event: EventDto;
  date: string;
  @ApiProperty({ type: [AttendanceRowDto] })
  rows: AttendanceRowDto[];
}

export class AttendanceSheetQueryDto {
  /** A day on which the event takes place. */
  @IsDay()
  date: string;
}

export class AttendanceEntryDto {
  @IsUUID()
  studentId: string;

  @ApiProperty({ enum: ATTENDANCE_STATUSES })
  @IsIn(ATTENDANCE_STATUSES)
  status: AttendanceStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(600)
  minutesLate?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class SaveAttendanceDto implements SaveAttendanceRequest {
  @IsDay()
  date: string;

  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => AttendanceEntryDto)
  records: AttendanceEntryDto[];
}

class AttendanceEventDto {
  id: string;
  type: ActivityTypeSummaryDto;
  title: string;
  subjectId: string | null;
  startTime: string | null;
  endTime: string | null;
}

export class StudentAttendanceDto implements StudentAttendanceContract {
  record: AttendanceRecordDto;
  event: AttendanceEventDto;
}

export class StudentAttendanceQueryDto {
  @IsOptional()
  @IsDay()
  from?: string;

  @IsOptional()
  @IsDay()
  to?: string;
}
