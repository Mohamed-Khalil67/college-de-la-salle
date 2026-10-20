import { Module } from '@nestjs/common';
import { SchoolYearsController } from './school-years.controller.js';
import { SchoolYearsService } from './school-years.service.js';

@Module({
  controllers: [SchoolYearsController],
  providers: [SchoolYearsService],
})
export class SchoolYearsModule {}
