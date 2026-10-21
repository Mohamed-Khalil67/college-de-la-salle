import { Module } from '@nestjs/common';
import { ActivityTypesModule } from '../activity-types/activity-types.module.js';
import { CalendarDaysModule } from '../calendar-days/calendar-days.module.js';
import { PeriodsModule } from '../periods/periods.module.js';
import { EventsController } from './events.controller.js';
import { EventsService } from './events.service.js';

@Module({
  imports: [ActivityTypesModule, PeriodsModule, CalendarDaysModule],
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
