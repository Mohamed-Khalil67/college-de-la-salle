import { Module } from '@nestjs/common';
import { TargetsModule } from '../targets/targets.module.js';
import { ClassesModule } from '../classes/classes.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { PeriodsModule } from '../periods/periods.module.js';
import { GradesController } from './grades.controller.js';
import { GradesService } from './grades.service.js';

@Module({
  imports: [TargetsModule, ClassesModule, PeriodsModule, NotificationsModule],
  controllers: [GradesController],
  providers: [GradesService],
})
export class GradesModule {}
