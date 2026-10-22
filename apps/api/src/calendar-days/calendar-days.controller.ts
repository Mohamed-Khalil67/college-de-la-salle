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
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, StructureEditors } from '../common/decorators.js';
import { CalendarDaysService } from './calendar-days.service.js';
import {
  CalendarDayDto,
  CalendarDayQueryDto,
  CreateCalendarDayDto,
  UpdateCalendarDayDto,
} from './dto/calendar-day.dto.js';

@ApiTags('calendar-days')
@ApiBearerAuth()
@Controller('calendar-days')
export class CalendarDaysController {
  constructor(private readonly days: CalendarDaysService) {}

  /**
   * Holidays, exam weeks and other days, by start day. Needs a school year or a range (from and to);
   * students only see the days that concern their section and class.
   */
  @Get()
  @ApiOkResponse({ type: [CalendarDayDto] })
  list(
    @Query() query: CalendarDayQueryDto,
    @CurrentUser() user: AuthUser,
  ): Promise<CalendarDayDto[]> {
    return this.days.list(query, user);
  }

  /** Admin or coordinator. */
  @StructureEditors()
  @Post()
  @ApiCreatedResponse({ type: CalendarDayDto })
  create(
    @Body() body: CreateCalendarDayDto,
    @CurrentUser() user: AuthUser,
  ): Promise<CalendarDayDto> {
    return this.days.create(body, user);
  }

  /** Admin or coordinator. */
  @StructureEditors()
  @Patch(':id')
  @ApiOkResponse({ type: CalendarDayDto })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateCalendarDayDto,
    @CurrentUser() user: AuthUser,
  ): Promise<CalendarDayDto> {
    return this.days.update(id, body, user);
  }

  /** Admin or coordinator. */
  @StructureEditors()
  @Delete(':id')
  @HttpCode(204)
  @ApiNoContentResponse()
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser): Promise<void> {
    return this.days.remove(id, user);
  }
}
