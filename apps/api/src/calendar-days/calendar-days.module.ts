import { Module } from '@nestjs/common';
import { OccupancyModule } from '../occupancy/occupancy.module.js';
import { CalendarDaysController } from './calendar-days.controller.js';
import { CalendarDaysService } from './calendar-days.service.js';

@Module({
  imports: [OccupancyModule],
  controllers: [CalendarDaysController],
  providers: [CalendarDaysService],
  exports: [CalendarDaysService],
})
export class CalendarDaysModule {}
