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
  Query,
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
import { CurrentUser, Roles } from '../common/decorators.js';
import { ClassesService } from './classes.service.js';
import {
  ClassDto,
  ClassListQueryDto,
  CreateClassDto,
  EnrollmentDto,
  EnrollStudentDto,
  SectionDto,
  ClassStudentDto,
  UpdateClassDto,
} from './dto/class.dto.js';

@ApiTags('classes')
@ApiBearerAuth()
@Controller()
export class ClassesController {
  constructor(private readonly classes: ClassesService) {}

  /** The two tracks: Bac nationale and Bac français. */
  @Get('sections')
  @ApiOkResponse({ type: [SectionDto] })
  sections(): Promise<SectionDto[]> {
    return this.classes.sections();
  }

  @Get('classes')
  @ApiOkResponse({ type: [ClassDto] })
  list(@Query() query: ClassListQueryDto): Promise<ClassDto[]> {
    return this.classes.list(query.schoolYearId);
  }

  @Get('classes/:id')
  @ApiOkResponse({ type: ClassDto })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<ClassDto> {
    return this.classes.get(id);
  }

  @Roles('admin')
  @Post('classes')
  @ApiCreatedResponse({ type: ClassDto })
  create(@Body() body: CreateClassDto): Promise<ClassDto> {
    return this.classes.create(body);
  }

  @Roles('admin')
  @Patch('classes/:id')
  @ApiOkResponse({ type: ClassDto })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateClassDto): Promise<ClassDto> {
    return this.classes.update(id, body);
  }

  /** Deletes an empty class (no student, grade, attendance or report card); 409 otherwise. */
  @Roles('admin')
  @Delete('classes/:id')
  @HttpCode(204)
  @ApiNoContentResponse()
  @ApiConflictResponse({
    description: 'The class has students, grades, attendance or report cards.',
  })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser): Promise<void> {
    return this.classes.remove(id, user);
  }

  /** The class list (admins and the class's teachers). */
  @Roles('admin', 'teacher')
  @Get('classes/:id/students')
  @ApiOkResponse({ type: [ClassStudentDto] })
  students(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<ClassStudentDto[]> {
    return this.classes.students(id, user);
  }

  /** Enrols a student (moves them if already in another class of that year). */
  @Roles('admin')
  @Post('classes/:id/enrollments')
  @ApiCreatedResponse({ type: EnrollmentDto })
  enroll(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: EnrollStudentDto,
  ): Promise<EnrollmentDto> {
    return this.classes.enroll(id, body.studentId);
  }

  @Roles('admin')
  @Delete('enrollments/:id')
  @HttpCode(204)
  @ApiNoContentResponse()
  unenroll(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.classes.unenroll(id);
  }
}
