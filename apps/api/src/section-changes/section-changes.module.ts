import { Module } from '@nestjs/common';
import { SectionChangesController } from './section-changes.controller.js';
import { SectionChangesService } from './section-changes.service.js';

@Module({
  controllers: [SectionChangesController],
  providers: [SectionChangesService],
})
export class SectionChangesModule {}
