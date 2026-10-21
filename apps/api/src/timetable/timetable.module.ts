import { Module } from '@nestjs/common';
import { OccupancyModule } from '../occupancy/occupancy.module.js';
import { TimetableReadService } from './timetable-read.service.js';
import { TimetableController } from './timetable.controller.js';
import { TimetableService } from './timetable.service.js';
import { WarningsService } from './warnings.service.js';

@Module({
  imports: [OccupancyModule],
  controllers: [TimetableController],
  providers: [TimetableService, TimetableReadService, WarningsService],
})
export class TimetableModule {}
