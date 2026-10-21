import { Module } from '@nestjs/common';
import { TargetsModule } from '../targets/targets.module.js';
import { CalendarDaysModule } from '../calendar-days/calendar-days.module.js';
import { ClassesModule } from '../classes/classes.module.js';
import { AttendanceController } from './attendance.controller.js';
import { AttendanceService } from './attendance.service.js';

@Module({
  imports: [TargetsModule, ClassesModule, CalendarDaysModule],
  controllers: [AttendanceController],
  providers: [AttendanceService],
})
export class AttendanceModule {}
