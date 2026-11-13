import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiForbiddenResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, Roles } from '../common/decorators.js';
import { TeacherSummaryDto } from './dto/teacher-summary.dto.js';
import type { TeacherSummaryDto as TeacherSummaryContract } from '@cdls/shared';
import { TeacherSummaryService } from './teacher-summary.service.js';

/** The teacher's home page in one request. Teachers only, and only their own classes. */
@ApiTags('teacher')
@ApiBearerAuth()
@Roles('teacher')
@Controller('teacher')
export class TeacherSummaryController {
  constructor(private readonly summary: TeacherSummaryService) {}

  /** Today's lessons with « Appel fait », notes to finish, homework given, tests planned and repeated absences. */
  @Get('summary')
  @ApiOkResponse({ type: TeacherSummaryDto })
  @ApiForbiddenResponse({ description: 'Not a teacher.' })
  get(@CurrentUser() user: AuthUser): Promise<TeacherSummaryContract> {
    return this.summary.summary(user);
  }
}
