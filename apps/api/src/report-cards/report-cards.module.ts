import { Module } from '@nestjs/common';
import { ClassesModule } from '../classes/classes.module.js';
import { ReportCardsController } from './report-cards.controller.js';
import { ReportCardsService } from './report-cards.service.js';

@Module({
  imports: [ClassesModule],
  controllers: [ReportCardsController],
  providers: [ReportCardsService],
})
export class ReportCardsModule {}
