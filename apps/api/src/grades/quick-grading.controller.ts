import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, Roles } from '../common/decorators.js';
import {
  CreateQuickAssessmentDto,
  GradeSheetDto,
  PendingGradingDto,
  PendingGradingQueryDto,
} from './dto/grade.dto.js';
import { QuickGradingService } from './quick-grading.service.js';

/** « Noter »: grade a class straight away (teachers of that class and subject). */
@ApiTags('grades')
@ApiBearerAuth()
@Roles('teacher')
@Controller('grading')
export class QuickGradingController {
  constructor(private readonly grading: QuickGradingService) {}

  /** « Nouvelle note »: creates today's gradable event for the whole class and answers its empty grade sheet. */
  @Post('assessments')
  @ApiCreatedResponse({ type: GradeSheetDto })
  @ApiForbiddenResponse({ description: 'Not a teacher of this class and subject.' })
  @ApiConflictResponse({ description: 'No open period covers today for this class.' })
  create(
    @Body() body: CreateQuickAssessmentDto,
    @CurrentUser() user: AuthUser,
  ): Promise<GradeSheetDto> {
    return this.grading.create(body, user);
  }

  /** The work still to grade for a class and subject: drafts, planned exams, half-entered marks. */
  @Get('pending')
  @ApiOkResponse({ type: [PendingGradingDto] })
  @ApiForbiddenResponse({ description: 'Not a teacher of this class and subject.' })
  pending(
    @Query() query: PendingGradingQueryDto,
    @CurrentUser() user: AuthUser,
  ): Promise<PendingGradingDto[]> {
    return this.grading.pending(query, user);
  }
}
