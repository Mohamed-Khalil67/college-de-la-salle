import { Module } from '@nestjs/common';
import { ClassesModule } from '../classes/classes.module.js';
import { GradesController } from './grades.controller.js';
import { GradesService } from './grades.service.js';

@Module({
  imports: [ClassesModule],
  controllers: [GradesController],
  providers: [GradesService],
})
export class GradesModule {}
