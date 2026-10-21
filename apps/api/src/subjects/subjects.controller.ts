import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, StructureEditors } from '../common/decorators.js';
import {
  CreateSubjectDto,
  SubjectDto,
  SubjectListQueryDto,
  UpdateSubjectDto,
} from './dto/subject.dto.js';
import { SubjectsService } from './subjects.service.js';

@ApiTags('subjects')
@ApiBearerAuth()
@Controller('subjects')
export class SubjectsController {
  constructor(private readonly subjects: SubjectsService) {}

  /** The catalogue, by group and name (archived subjects only with `includeArchived=true`). */
  @Get()
  @ApiOkResponse({ type: [SubjectDto] })
  list(@Query() query: SubjectListQueryDto): Promise<SubjectDto[]> {
    return this.subjects.list(query);
  }

  /** Admin or coordinator. The id is made from the name. */
  @StructureEditors()
  @Post()
  @ApiCreatedResponse({ type: SubjectDto })
  @ApiConflictResponse({ description: 'A subject already has this name.' })
  create(@Body() body: CreateSubjectDto, @CurrentUser() user: AuthUser): Promise<SubjectDto> {
    return this.subjects.create(body, user);
  }

  /** Admin or coordinator: rename, change the sections, archive or restore. */
  @StructureEditors()
  @Patch(':id')
  @ApiOkResponse({ type: SubjectDto })
  @ApiConflictResponse({ description: 'A removed section still has classes with this subject.' })
  update(
    @Param('id') id: string,
    @Body() body: UpdateSubjectDto,
    @CurrentUser() user: AuthUser,
  ): Promise<SubjectDto> {
    return this.subjects.update(id, body, user);
  }
}
