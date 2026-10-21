import { Module } from '@nestjs/common';
import { ClassesModule } from '../classes/classes.module.js';
import { PeriodsModule } from '../periods/periods.module.js';
import { GradesController } from './grades.controller.js';
import { GradesService } from './grades.service.js';

@Module({
  imports: [ClassesModule, PeriodsModule],
  controllers: [GradesController],
  providers: [GradesService],
})
export class GradesModule {}
