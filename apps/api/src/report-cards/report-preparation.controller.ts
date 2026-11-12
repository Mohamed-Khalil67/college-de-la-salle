import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, Roles } from '../common/decorators.js';
import { throttleLimit } from '../config/throttle-limits.js';
import {
  ReportPreparationDto,
  ReportReminderDto,
  ReportReminderResultDto,
} from './dto/report-preparation.dto.js';
import { ReportPreparationService } from './report-preparation.service.js';

const reminderLimit = throttleLimit('REMINDER_THROTTLE_LIMIT');

/** « Préparer les bulletins »: admin only (a planner prepares time and place, not report cards). */
@ApiTags('report-cards')
@ApiBearerAuth()
@Controller('periods/:id/report-preparation')
export class ReportPreparationController {
  constructor(private readonly preparation: ReportPreparationService) {}

  /** Per class: the subjects not ready for the report cards of the period, and who teaches them. */
  @Roles('admin')
  @Get()
  @ApiOkResponse({ type: ReportPreparationDto })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<ReportPreparationDto> {
    return this.preparation.preparation(id);
  }

  /**
   * « Relancer »: reminds the teachers who still have grades to finish (one class, or all). At most REMINDER_THROTTLE_LIMIT (10)
   * requests a minute, and a teacher is reminded once per period every few hours.
   */
  @Roles('admin')
  @Throttle({ default: { limit: reminderLimit, ttl: 60_000 } })
  @Post('reminders')
  @HttpCode(200)
  @ApiOkResponse({ type: ReportReminderResultDto })
  remind(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ReportReminderDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ReportReminderResultDto> {
    return this.preparation.remind(id, body, user);
  }
}
