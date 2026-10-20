import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, Roles } from '../common/decorators.js';
import {
  CreateEventDto,
  EventDto,
  EventRangeQueryDto,
  OccurrenceDto,
  UpdateEventDto,
} from './dto/event.dto.js';
import { EventsService } from './events.service.js';

@ApiTags('events')
@ApiBearerAuth()
@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  /** Events in [from, to] (186 days max). Students only get the events addressed to them. */
  @Get()
  @ApiOkResponse({ type: [EventDto] })
  list(@Query() query: EventRangeQueryDto, @CurrentUser() user: AuthUser): Promise<EventDto[]> {
    return this.events.list(query, user);
  }

  /** The same range, one entry per day an event happens (weekly events expanded). */
  @Get('occurrences')
  @ApiOkResponse({ type: [OccurrenceDto] })
  occurrences(
    @Query() query: EventRangeQueryDto,
    @CurrentUser() user: AuthUser,
  ): Promise<OccurrenceDto[]> {
    return this.events.occurrences(query, user);
  }

  @Get(':id')
  @ApiOkResponse({ type: EventDto })
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser): Promise<EventDto> {
    return this.events.get(id, user);
  }

  /** « Ajouter à mon agenda »: the event as an .ics file. */
  @Get(':id/ics')
  @Header('Content-Type', 'text/calendar; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="evenement.ics"')
  @ApiProduces('text/calendar')
  ics(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser): Promise<string> {
    return this.events.ics(id, user);
  }

  /** Teachers: events for their classes (graded kinds need a class), or ungraded section/school events. */
  @Roles('teacher')
  @Post()
  @ApiCreatedResponse({ type: EventDto })
  create(@Body() body: CreateEventDto, @CurrentUser() user: AuthUser): Promise<EventDto> {
    return this.events.create(body, user);
  }

  /** The author or an admin. */
  @Roles('teacher', 'admin')
  @Patch(':id')
  @ApiOkResponse({ type: EventDto })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateEventDto,
    @CurrentUser() user: AuthUser,
  ): Promise<EventDto> {
    return this.events.update(id, body, user);
  }

  /** The author or an admin; refused while grades exist. */
  @Roles('teacher', 'admin')
  @Delete(':id')
  @HttpCode(204)
  @ApiNoContentResponse()
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser): Promise<void> {
    return this.events.remove(id, user);
  }
}
