import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators.js';
import { SubjectDto, UpdateSubjectDto } from './dto/subject.dto.js';
import { SubjectsService } from './subjects.service.js';

@ApiTags('subjects')
@ApiBearerAuth()
@Controller('subjects')
export class SubjectsController {
  constructor(private readonly subjects: SubjectsService) {}

  @Get()
  @ApiOkResponse({ type: [SubjectDto] })
  list(): Promise<SubjectDto[]> {
    return this.subjects.list();
  }

  @Roles('admin')
  @Patch(':id')
  @ApiOkResponse({ type: SubjectDto })
  update(@Param('id') id: string, @Body() body: UpdateSubjectDto): Promise<SubjectDto> {
    return this.subjects.update(id, body);
  }
}
