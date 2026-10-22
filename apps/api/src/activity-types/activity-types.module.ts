import { Module } from '@nestjs/common';
import { ActivityTypesController } from './activity-types.controller.js';
import { ActivityTypesService } from './activity-types.service.js';

@Module({
  controllers: [ActivityTypesController],
  providers: [ActivityTypesService],
  exports: [ActivityTypesService],
})
export class ActivityTypesModule {}
