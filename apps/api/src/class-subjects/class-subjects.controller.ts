import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, Roles, StructureEditors } from '../common/decorators.js';
import { ClassSubjectsService } from './class-subjects.service.js';
import {
  ClassSubjectDto,
  CopyClassSubjectsDto,
  CreateClassSubjectDto,
  UpdateClassSubjectDto,
} from './dto/class-subject.dto.js';

@ApiTags('class-subjects')
@ApiBearerAuth()
@Controller()
export class ClassSubjectsController {
  constructor(private readonly classSubjects: ClassSubjectsService) {}

  /** A class's subjects with their coefficient, hours and teachers (staff). */
  @Roles('admin', 'teacher')
  @Get('classes/:id/subjects')
  @ApiOkResponse({ type: [ClassSubjectDto] })
  list(@Param('id', ParseUUIDPipe) id: string): Promise<ClassSubjectDto[]> {
    return this.classSubjects.list(id);
  }

  /** Admin or coordinator: adds a subject to the class. */
  @StructureEditors()
  @Post('classes/:id/subjects')
  @ApiCreatedResponse({ type: ClassSubjectDto })
  @ApiConflictResponse({ description: 'The class already has this subject.' })
  create(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CreateClassSubjectDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ClassSubjectDto> {
    return this.classSubjects.create(id, body, user);
  }

  /** Admin or coordinator: « Copier depuis la classe… ». Returns the class's subjects. */
  @StructureEditors()
  @Post('classes/:id/subjects/copy')
  @HttpCode(200)
  @ApiOkResponse({ type: [ClassSubjectDto] })
  copy(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CopyClassSubjectsDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ClassSubjectDto[]> {
    return this.classSubjects.copy(id, body.fromClassId, user);
  }

  /** Admin or coordinator: coefficient and hours per week. */
  @StructureEditors()
  @Patch('class-subjects/:id')
  @ApiOkResponse({ type: ClassSubjectDto })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateClassSubjectDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ClassSubjectDto> {
    return this.classSubjects.update(id, body, user);
  }

  /** Admin or coordinator; 409 while the subject has teachers or grades in the class. */
  @StructureEditors()
  @Delete('class-subjects/:id')
  @HttpCode(204)
  @ApiNoContentResponse()
  @ApiConflictResponse({ description: 'The subject still has teachers or grades in the class.' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser): Promise<void> {
    return this.classSubjects.remove(id, user);
  }
}
