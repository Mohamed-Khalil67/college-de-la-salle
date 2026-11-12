import { Module } from '@nestjs/common';
import { OccupancyModule } from '../occupancy/occupancy.module.js';
import { TimetableModule } from '../timetable/timetable.module.js';
import { PlannerController } from './planner.controller.js';
import { PlannerService } from './planner.service.js';

/** The planner's page (reads) and « Professeur absent » (one transaction, in the timetable service). */
@Module({
  imports: [TimetableModule, OccupancyModule],
  controllers: [PlannerController],
  providers: [PlannerService],
})
export class PlannerModule {}
