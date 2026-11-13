import { Module } from '@nestjs/common';
import { ActivityTypesModule } from '../activity-types/activity-types.module.js';
import { TargetsModule } from '../targets/targets.module.js';
import { ClassesModule } from '../classes/classes.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { PeriodsModule } from '../periods/periods.module.js';
import { GradesController } from './grades.controller.js';
import { GradesService } from './grades.service.js';
import { QuickGradingController } from './quick-grading.controller.js';
import { QuickGradingService } from './quick-grading.service.js';

@Module({
  imports: [TargetsModule, ClassesModule, PeriodsModule, NotificationsModule, ActivityTypesModule],
  controllers: [GradesController, QuickGradingController],
  providers: [GradesService, QuickGradingService],
  exports: [QuickGradingService],
})
export class GradesModule {}
