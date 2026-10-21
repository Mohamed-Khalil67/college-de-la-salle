import { Module } from '@nestjs/common';
import { OccupancyModule } from '../occupancy/occupancy.module.js';
import {
  GroupsRolloverStep,
  ROLLOVER_EXTRA_STEPS,
  type RolloverExtraStep,
} from './rollover-step.js';
import { RolloverController } from './rollover.controller.js';
import { RolloverService } from './rollover.service.js';

/**
 * Next school year. The extra steps array is the hook for phase 3 (groups): see `rollover-step.ts`.
 */
@Module({
  imports: [OccupancyModule],
  controllers: [RolloverController],
  providers: [
    RolloverService,
    GroupsRolloverStep,
    {
      provide: ROLLOVER_EXTRA_STEPS,
      inject: [GroupsRolloverStep],
      useFactory: (groups: GroupsRolloverStep): RolloverExtraStep[] => [groups],
    },
  ],
})
export class RolloverModule {}
