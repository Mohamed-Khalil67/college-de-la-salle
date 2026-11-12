import { Module } from '@nestjs/common';
import { ClassesModule } from '../classes/classes.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { ReportCardsController } from './report-cards.controller.js';
import { ReportCardsService } from './report-cards.service.js';
import { ReportPreparationController } from './report-preparation.controller.js';
import { ReportPreparationService } from './report-preparation.service.js';

@Module({
  imports: [ClassesModule, NotificationsModule],
  controllers: [ReportCardsController, ReportPreparationController],
  providers: [ReportCardsService, ReportPreparationService],
})
export class ReportCardsModule {}
