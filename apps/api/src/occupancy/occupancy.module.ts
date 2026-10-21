import { Module } from '@nestjs/common';
import { OccupancyService } from './occupancy.service.js';

/** The occupancy index (room, teacher and class bookings). Depends only on the database. */
@Module({
  providers: [OccupancyService],
  exports: [OccupancyService],
})
export class OccupancyModule {}
