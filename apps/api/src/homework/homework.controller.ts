import { Controller, Delete, Get, Param, ParseUUIDPipe, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, Roles } from '../common/decorators.js';
import { HomeworkCompletionDto, HomeworkDto, HomeworkQueryDto } from './dto/homework.dto.js';
import { HomeworkService } from './homework.service.js';

@ApiTags('homework')
@ApiBearerAuth()
@Controller()
export class HomeworkController {
  constructor(private readonly homework: HomeworkService) {}

  /** The signed-in student's homework with their done flags. */
  @Roles('student')
  @Get('homework')
  @ApiOkResponse({ type: [HomeworkDto] })
  mine(@Query() query: HomeworkQueryDto, @CurrentUser() user: AuthUser): Promise<HomeworkDto[]> {
    return this.homework.mine(user, query.from);
  }

  @Roles('student')
  @Put('homework/:eventId/done')
  @ApiOkResponse({ type: HomeworkDto })
  markDone(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<HomeworkDto> {
    return this.homework.setDone(eventId, true, user);
  }

  @Roles('student')
  @Delete('homework/:eventId/done')
  @ApiOkResponse({ type: HomeworkDto })
  markNotDone(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<HomeworkDto> {
    return this.homework.setDone(eventId, false, user);
  }

  /** Who has done this homework (the class's teachers and admins). */
  @Roles('teacher', 'admin')
  @Get('events/:id/completions')
  @ApiOkResponse({ type: [HomeworkCompletionDto] })
  completions(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<HomeworkCompletionDto[]> {
    return this.homework.completions(id, user);
  }
}
