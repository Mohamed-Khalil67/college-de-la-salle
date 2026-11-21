import { Controller, Delete, Get, Header, HttpCode, Inject, Param, Post, Res } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiProduces,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { feedFileName, type SchoolProfile } from '@cdls/shared';
import type { Response } from 'express';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, Public, Roles } from '../common/decorators.js';
import { CalendarFeedService } from './calendar-feed.service.js';
import {
  CalendarFeedCreatedDto,
  CalendarFeedDto,
  CalendarFeedFileParamDto,
} from './dto/calendar-feed.dto.js';
import { throttleLimit } from '../config/throttle-limits.js';
import { SCHOOL_PROFILE } from '../school/school.module.js';

const feedLimit = throttleLimit('FEED_THROTTLE_LIMIT');

@ApiTags('calendar-feed')
@Controller('calendar/feed')
export class CalendarFeedController {
  /** inline; filename="<calendar id>.ics": named after the school pack, never a name written here. */
  private readonly disposition: string;

  constructor(
    private readonly feeds: CalendarFeedService,
    @Inject(SCHOOL_PROFILE) school: SchoolProfile,
  ) {
    this.disposition = `inline; filename="${feedFileName(school.calendar)}"`;
  }

  /** Whether the signed-in user has a working feed address (the address itself is never shown again). */
  @Roles('student', 'teacher')
  @ApiBearerAuth()
  @Get()
  @ApiOkResponse({ type: CalendarFeedDto })
  status(@CurrentUser() user: AuthUser): Promise<CalendarFeedDto> {
    return this.feeds.status(user);
  }

  /** A new secret feed address (any earlier one stops working). The only time the address is sent. */
  @Roles('student', 'teacher')
  @ApiBearerAuth()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post()
  @ApiCreatedResponse({ type: CalendarFeedCreatedDto })
  create(@CurrentUser() user: AuthUser): Promise<CalendarFeedCreatedDto> {
    return this.feeds.create(user);
  }

  /** Revokes the feed address: calendar apps get 404 from now on. */
  @Roles('student', 'teacher')
  @ApiBearerAuth()
  @Delete()
  @HttpCode(204)
  @ApiNoContentResponse()
  revoke(@CurrentUser() user: AuthUser): Promise<void> {
    return this.feeds.revoke(user);
  }

  /**
   * The feed itself, for calendar apps: public, the token in the address is the credential. Limited to
   * FEED_THROTTLE_LIMIT (60) requests a minute per client; any token that does not work is a 404.
   */
  @Public()
  @Throttle({ default: { limit: feedLimit, ttl: 60_000 } })
  @Get(':file')
  @Header('Content-Type', 'text/calendar; charset=utf-8')
  @Header('Cache-Control', 'private, no-store')
  @Header('Referrer-Policy', 'no-referrer')
  @Header('X-Robots-Tag', 'noindex, nofollow')
  @ApiProduces('text/calendar')
  @ApiOkResponse({ description: 'An iCalendar file.' })
  @ApiNotFoundResponse({ description: 'Unknown, revoked or outdated address.' })
  @ApiTooManyRequestsResponse({ description: 'Too many requests from this client; retry later.' })
  feed(
    @Param() params: CalendarFeedFileParamDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    res.setHeader('Content-Disposition', this.disposition);
    return this.feeds.render(params.file);
  }
}
