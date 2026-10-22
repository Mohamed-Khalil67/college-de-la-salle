import { Module } from '@nestjs/common';
import { TargetsModule } from '../targets/targets.module.js';
import { EventsModule } from '../events/events.module.js';
import { HomeworkController } from './homework.controller.js';
import { HomeworkService } from './homework.service.js';

@Module({
  imports: [TargetsModule, EventsModule],
  controllers: [HomeworkController],
  providers: [HomeworkService],
})
export class HomeworkModule {}
