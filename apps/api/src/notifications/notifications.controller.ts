import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Paginated } from '@cdls/shared';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser } from '../common/decorators.js';
import { ApiPaginatedResponse } from '../common/pagination.js';
import {
  MarkNotificationsReadResponseDto,
  NotificationDto,
  NotificationListQueryDto,
  NotificationPreferencesDto,
  NotificationSummaryDto,
  UpdateNotificationPreferencesDto,
} from './dto/notification.dto.js';
import { NotificationsService } from './notifications.service.js';

/** Every signed-in user's own notifications: nobody reads or marks someone else's. */
@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  /** The user's notifications, newest first (`unread=true`: unread only). */
  @Get()
  @ApiPaginatedResponse(NotificationDto)
  list(
    @Query() query: NotificationListQueryDto,
    @CurrentUser() user: AuthUser,
  ): Promise<Paginated<NotificationDto>> {
    return this.notifications.list(user, query);
  }

  /** The unread count, for the bell. */
  @Get('summary')
  @ApiOkResponse({ type: NotificationSummaryDto })
  summary(@CurrentUser() user: AuthUser): Promise<NotificationSummaryDto> {
    return this.notifications.summary(user);
  }

  /** Whether the notifications are also sent by e-mail (off until the user turns it on). */
  @Get('preferences')
  @ApiOkResponse({ type: NotificationPreferencesDto })
  preferences(@CurrentUser() user: AuthUser): Promise<NotificationPreferencesDto> {
    return this.notifications.preferences(user);
  }

  @Put('preferences')
  @ApiOkResponse({ type: NotificationPreferencesDto })
  updatePreferences(
    @Body() body: UpdateNotificationPreferencesDto,
    @CurrentUser() user: AuthUser,
  ): Promise<NotificationPreferencesDto> {
    return this.notifications.updatePreferences(user, body);
  }

  /** Marks every unread notification read. */
  @Post('read-all')
  @HttpCode(200)
  @ApiOkResponse({ type: MarkNotificationsReadResponseDto })
  markAllRead(@CurrentUser() user: AuthUser): Promise<MarkNotificationsReadResponseDto> {
    return this.notifications.markAllRead(user);
  }

  /** Marks one notification read (404 for anyone else's). */
  @Post(':id/read')
  @HttpCode(200)
  @ApiOkResponse({ type: NotificationDto })
  markRead(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<NotificationDto> {
    return this.notifications.markRead(user, id);
  }
}
