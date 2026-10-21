import { Module } from '@nestjs/common';
import { TargetsService } from './targets.service.js';

@Module({
  providers: [TargetsService],
  exports: [TargetsService],
})
export class TargetsModule {}
