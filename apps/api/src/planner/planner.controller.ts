import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiConflictResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { ApplyAbsenceResult } from '@cdls/shared';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, StructureEditors } from '../common/decorators.js';
import { TimetableService } from '../timetable/timetable.service.js';
import {
  AbsencePreviewDto,
  AbsencePreviewQueryDto,
  ApplyAbsenceDto,
  ApplyAbsenceResultDto,
  PlannerDayQueryDto,
  PlannerRoomsNowDto,
  PlannerTeacherDto,
  PlannerTimetablesDto,
  PlannerTodayDto,
} from './dto/planner.dto.js';
import { PlannerService } from './planner.service.js';

/**
 * The planner's page and « Professeur absent ». Admin or planner only (`@StructureEditors()`, spelled once for
 * the whole controller): a teacher who is not planner, and a student, get 403 on every route.
 */
@ApiTags('planner')
@ApiBearerAuth()
@StructureEditors()
@Controller('planner')
export class PlannerController {
  constructor(
    private readonly planner: PlannerService,
    private readonly timetable: TimetableService,
  ) {}

  /** The active teachers, to choose the absent one (the user list is the admin's alone). */
  @Get('teachers')
  @ApiOkResponse({ type: [PlannerTeacherDto] })
  teachers(): Promise<PlannerTeacherDto[]> {
    return this.planner.teachers();
  }

  /** The lessons of an absent teacher between two days, with the teachers free to cover each. */
  @Get('absence')
  @ApiOkResponse({ type: AbsencePreviewDto })
  absence(
    @Query() query: AbsencePreviewQueryDto,
    @CurrentUser() user: AuthUser,
  ): Promise<AbsencePreviewDto> {
    return this.planner.absence(query, user);
  }

  /**
   * Saves one choice per lesson (cancel, substitute, supervised study) in one transaction, with the audit
   * rows, and tells the students, the teacher and the covering teachers.
   */
  @Post('absence')
  @HttpCode(200)
  @ApiOkResponse({ type: ApplyAbsenceResultDto })
  @ApiConflictResponse({
    description:
      '409 `TIMETABLE_CONFLICT` (a covering teacher or a room is already taken) or `WARNINGS_NOT_ACKNOWLEDGED`.',
  })
  apply(@Body() body: ApplyAbsenceDto, @CurrentUser() user: AuthUser): Promise<ApplyAbsenceResult> {
    return this.timetable.applyAbsence(body, user);
  }

  /** The changes of a day and whether the students were told. */
  @Get('today')
  @ApiOkResponse({ type: PlannerTodayDto })
  today(@Query() query: PlannerDayQueryDto): Promise<PlannerTodayDto> {
    return this.planner.today(query.date);
  }

  /** The active rooms free right now, with the time they are taken again. */
  @Get('rooms-now')
  @ApiOkResponse({ type: PlannerRoomsNowDto })
  roomsNow(): Promise<PlannerRoomsNowDto> {
    return this.planner.roomsNow();
  }

  /** How complete the timetable of the current year is. */
  @Get('timetables')
  @ApiOkResponse({ type: PlannerTimetablesDto })
  timetables(): Promise<PlannerTimetablesDto> {
    return this.planner.timetables();
  }
}
