import { Module } from '@nestjs/common';
import { CalendarDaysController } from './calendar-days.controller.js';
import { CalendarDaysService } from './calendar-days.service.js';

@Module({
  controllers: [CalendarDaysController],
  providers: [CalendarDaysService],
  exports: [CalendarDaysService],
})
export class CalendarDaysModule {}
