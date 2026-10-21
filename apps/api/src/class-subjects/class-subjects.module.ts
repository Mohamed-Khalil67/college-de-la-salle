import { Module } from '@nestjs/common';
import { ClassSubjectsController } from './class-subjects.controller.js';
import { ClassSubjectsService } from './class-subjects.service.js';

@Module({
  controllers: [ClassSubjectsController],
  providers: [ClassSubjectsService],
})
export class ClassSubjectsModule {}
