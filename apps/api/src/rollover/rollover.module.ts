import { Module } from '@nestjs/common';
import { OccupancyModule } from '../occupancy/occupancy.module.js';
import { GroupsRolloverStep } from './groups-rollover-step.js';
import { ROLLOVER_EXTRA_STEPS, type RolloverExtraStep } from './rollover-step.js';
import { RolloverController } from './rollover.controller.js';
import { RolloverService } from './rollover.service.js';

/** Next school year. The extra steps array is the hook other modules plug into (the groups: `groups-rollover-step.ts`). */
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
