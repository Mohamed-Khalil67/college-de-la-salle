import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiForbiddenResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, Roles } from '../common/decorators.js';
import {
  GradeSheetDto,
  PublishGradesDto,
  SaveGradesDto,
  StudentGradesDto,
  StudentGradesQueryDto,
} from './dto/grade.dto.js';
import { GradesService } from './grades.service.js';

@ApiTags('grades')
@ApiBearerAuth()
@Controller()
export class GradesController {
  constructor(private readonly grades: GradesService) {}

  /** The grade-entry grid: every student of the class with their grade (a teacher of that class and subject). */
  @Roles('teacher', 'admin')
  @Get('events/:id/grades')
  @ApiOkResponse({ type: GradeSheetDto })
  @ApiForbiddenResponse({ description: 'Not a teacher of this class and subject.' })
  sheet(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<GradeSheetDto> {
    return this.grades.sheet(id, user);
  }

  /** Enters, corrects or removes (score null) grades; audited. */
  @Roles('teacher', 'admin')
  @Put('events/:id/grades')
  @ApiOkResponse({ type: GradeSheetDto })
  @ApiForbiddenResponse({ description: 'Not a teacher of this class and subject.' })
  save(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SaveGradesDto,
    @CurrentUser() user: AuthUser,
  ): Promise<GradeSheetDto> {
    return this.grades.save(id, body, user);
  }

  /** Publishes (or unpublishes) the event's grades to the students; audited. */
  @Roles('teacher', 'admin')
  @Post('events/:id/grades/publish')
  @HttpCode(200)
  @ApiOkResponse({ type: GradeSheetDto })
  publish(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: PublishGradesDto,
    @CurrentUser() user: AuthUser,
  ): Promise<GradeSheetDto> {
    return this.grades.publish(id, body, user);
  }

  /** A student's grades and averages by subject. Students: their own, published only. */
  @Get('students/:id/grades')
  @ApiOkResponse({ type: StudentGradesDto })
  @ApiForbiddenResponse({
    description: 'Another student, or a teacher who does not teach this student.',
  })
  forStudent(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: StudentGradesQueryDto,
    @CurrentUser() user: AuthUser,
  ): Promise<StudentGradesDto> {
    return this.grades.forStudent(id, query, user);
  }
}
