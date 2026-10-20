import { Body, Controller, Get, Param, ParseUUIDPipe, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiForbiddenResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, Roles } from '../common/decorators.js';
import { AttendanceService } from './attendance.service.js';
import {
  AttendanceSheetDto,
  AttendanceSheetQueryDto,
  SaveAttendanceDto,
  StudentAttendanceDto,
  StudentAttendanceQueryDto,
} from './dto/attendance.dto.js';

@ApiTags('attendance')
@ApiBearerAuth()
@Controller()
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  /** The roll-call sheet of one day of a class event (the class's teachers and admins). */
  @Roles('teacher', 'admin')
  @Get('events/:id/attendance')
  @ApiOkResponse({ type: AttendanceSheetDto })
  @ApiForbiddenResponse({ description: 'Not a teacher of this class.' })
  sheet(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: AttendanceSheetQueryDto,
    @CurrentUser() user: AuthUser,
  ): Promise<AttendanceSheetDto> {
    return this.attendance.sheet(id, query.date, user);
  }

  @Roles('teacher', 'admin')
  @Put('events/:id/attendance')
  @ApiOkResponse({ type: AttendanceSheetDto })
  @ApiForbiddenResponse({ description: 'Not a teacher of this class.' })
  save(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SaveAttendanceDto,
    @CurrentUser() user: AuthUser,
  ): Promise<AttendanceSheetDto> {
    return this.attendance.save(id, body, user);
  }

  /** A student's absences and late arrivals. Students: their own. */
  @Get('students/:id/attendance')
  @ApiOkResponse({ type: [StudentAttendanceDto] })
  forStudent(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: StudentAttendanceQueryDto,
    @CurrentUser() user: AuthUser,
  ): Promise<StudentAttendanceDto[]> {
    return this.attendance.forStudent(id, query, user);
  }
}
