import { Module } from '@nestjs/common';
import { ActivityTypesModule } from '../activity-types/activity-types.module.js';
import { CalendarDaysModule } from '../calendar-days/calendar-days.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { OccupancyModule } from '../occupancy/occupancy.module.js';
import { PeriodsModule } from '../periods/periods.module.js';
import { TargetsModule } from '../targets/targets.module.js';
import { EventsController } from './events.controller.js';
import { EventsService } from './events.service.js';

@Module({
  imports: [
    ActivityTypesModule,
    PeriodsModule,
    CalendarDaysModule,
    OccupancyModule,
    TargetsModule,
    NotificationsModule,
  ],
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
