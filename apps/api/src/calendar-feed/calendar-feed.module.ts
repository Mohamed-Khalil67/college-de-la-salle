import { Module } from '@nestjs/common';
import { CalendarFeedController } from './calendar-feed.controller.js';
import { CalendarFeedService } from './calendar-feed.service.js';
import { FeedBuilderService } from './feed-builder.service.js';

/** « Synchroniser mon agenda »: the secret feed address of each student and teacher. */
@Module({
  controllers: [CalendarFeedController],
  providers: [CalendarFeedService, FeedBuilderService],
})
export class CalendarFeedModule {}
