import { Module } from '@nestjs/common';
import { TeachingAssignmentsController } from './teaching-assignments.controller.js';
import { TeachingAssignmentsService } from './teaching-assignments.service.js';

@Module({
  controllers: [TeachingAssignmentsController],
  providers: [TeachingAssignmentsService],
})
export class TeachingAssignmentsModule {}
