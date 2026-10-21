import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Paginated } from '@cdls/shared';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, Roles, StructureEditors } from '../common/decorators.js';
import { ApiPaginatedResponse } from '../common/pagination.js';
import {
  CreateSlotExceptionDto,
  CreateTimetableSlotDto,
  DeleteTimetableSlotQueryDto,
  FreeRoomDto,
  FreeRoomsQueryDto,
  TimetableCheckDto,
  TimetableCheckResultDto,
  TimetableOccurrenceDto,
  TimetableOccurrenceQueryDto,
  TimetableSlotDto,
  TimetableSlotListQueryDto,
  TimetableWarningDto,
  TimetableWriteResultDto,
  UpdateTimetableSlotDto,
} from './dto/timetable.dto.js';
import { TimetableReadService } from './timetable-read.service.js';
import { TimetableService } from './timetable.service.js';

const CONFLICT_DOC =
  '409 `TIMETABLE_CONFLICT` (room, teacher or class already taken) or `WARNINGS_NOT_ACKNOWLEDGED` (soft warnings need a reason each).';

/**
 * The timetable. Admins and coordinators edit any slot; a teacher changes only their own sessions
 * (exceptions: cancel, move, change room) within their assignments; students read their class.
 * Ownership is checked in the services.
 */
@ApiTags('timetable')
@ApiBearerAuth()
@Controller('timetable')
export class TimetableController {
  constructor(
    private readonly timetable: TimetableService,
    private readonly reads: TimetableReadService,
  ) {}

  /** The weekly slots by class, teacher or room (admin or coordinator). */
  @StructureEditors()
  @Get('slots')
  @ApiPaginatedResponse(TimetableSlotDto)
  listSlots(@Query() query: TimetableSlotListQueryDto): Promise<Paginated<TimetableSlotDto>> {
    return this.reads.listSlots(query);
  }

  /** One slot (admin, coordinator, or the teacher of the slot). */
  @Roles('admin', 'coordinator', 'teacher')
  @Get('slots/:id')
  @ApiOkResponse({ type: TimetableSlotDto })
  getSlot(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<TimetableSlotDto> {
    return this.reads.getSlot(id, user);
  }

  /** Creates a weekly slot (admin or coordinator). */
  @StructureEditors()
  @Post('slots')
  @ApiCreatedResponse({ type: TimetableWriteResultDto })
  @ApiConflictResponse({ description: CONFLICT_DOC })
  create(
    @Body() body: CreateTimetableSlotDto,
    @CurrentUser() user: AuthUser,
  ): Promise<TimetableWriteResultDto> {
    return this.timetable.create(body, user);
  }

  /** « Cette séance / Celle-ci et les suivantes / Toute la série ». A teacher may only use `this`, for their own sessions. */
  @Roles('admin', 'coordinator', 'teacher')
  @Patch('slots/:id')
  @ApiOkResponse({ type: TimetableWriteResultDto })
  @ApiConflictResponse({ description: CONFLICT_DOC })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateTimetableSlotDto,
    @CurrentUser() user: AuthUser,
  ): Promise<TimetableWriteResultDto> {
    return this.timetable.update(id, body, user);
  }

  /** Cancels a session, ends a series, or deletes it (admin or coordinator). Past sessions stay. */
  @StructureEditors()
  @Delete('slots/:id')
  @ApiOkResponse({ type: TimetableWriteResultDto })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: DeleteTimetableSlotQueryDto,
    @CurrentUser() user: AuthUser,
  ): Promise<TimetableWriteResultDto> {
    return this.timetable.remove(id, query, user);
  }

  /** Changes one session: cancelled, moved, substitute, room change (admins; teachers for their own sessions, except substitutes). */
  @Roles('admin', 'coordinator', 'teacher')
  @Post('slots/:id/exceptions')
  @ApiCreatedResponse({ type: TimetableWriteResultDto })
  @ApiConflictResponse({ description: CONFLICT_DOC })
  addException(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CreateSlotExceptionDto,
    @CurrentUser() user: AuthUser,
  ): Promise<TimetableWriteResultDto> {
    return this.timetable.addException(id, body, user);
  }

  /** Restores a session to what the weekly rule says. */
  @Roles('admin', 'coordinator', 'teacher')
  @Delete('exceptions/:id')
  @HttpCode(200)
  @ApiOkResponse({ type: TimetableWriteResultDto })
  removeException(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<TimetableWriteResultDto> {
    return this.timetable.removeException(id, user);
  }

  /** What a write would do (hard conflicts, warnings), without saving. */
  @Roles('admin', 'coordinator', 'teacher')
  @Post('check')
  @HttpCode(200)
  @ApiOkResponse({ type: TimetableCheckResultDto })
  check(
    @Body() body: TimetableCheckDto,
    @CurrentUser() user: AuthUser,
  ): Promise<TimetableCheckResultDto> {
    return this.timetable.check(body, user);
  }

  /** Sessions of a class, a teacher or a room between two days; students read their own class. */
  @Get('occurrences')
  @ApiOkResponse({ type: [TimetableOccurrenceDto] })
  occurrences(
    @Query() query: TimetableOccurrenceQueryDto,
    @CurrentUser() user: AuthUser,
  ): Promise<TimetableOccurrenceDto[]> {
    return this.reads.occurrences(query, user);
  }

  /** Soft warnings of the stored timetable in a range (admin or coordinator). */
  @StructureEditors()
  @Get('warnings')
  @ApiOkResponse({ type: [TimetableWarningDto] })
  warnings(@Query() query: TimetableOccurrenceQueryDto): Promise<TimetableWarningDto[]> {
    return this.reads.warningsFor(query);
  }

  /** Rooms free in a time range (staff). */
  @Roles('admin', 'coordinator', 'teacher')
  @Get('free-rooms')
  @ApiOkResponse({ type: [FreeRoomDto] })
  freeRooms(@Query() query: FreeRoomsQueryDto): Promise<FreeRoomDto[]> {
    return this.reads.freeRooms(query);
  }
}
