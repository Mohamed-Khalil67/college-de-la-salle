import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, Roles } from '../common/decorators.js';
import {
  CreateTeachingAssignmentDto,
  TeachingAssignmentDto,
  TeachingAssignmentQueryDto,
} from './dto/teaching-assignment.dto.js';
import { TeachingAssignmentsService } from './teaching-assignments.service.js';

@ApiTags('teaching-assignments')
@ApiBearerAuth()
@Controller('teaching-assignments')
export class TeachingAssignmentsController {
  constructor(private readonly assignments: TeachingAssignmentsService) {}

  /** Current-year assignments. Teachers get their own; admins can filter by teacher or class. */
  @Roles('admin', 'teacher')
  @Get()
  @ApiOkResponse({ type: [TeachingAssignmentDto] })
  list(
    @Query() query: TeachingAssignmentQueryDto,
    @CurrentUser() user: AuthUser,
  ): Promise<TeachingAssignmentDto[]> {
    return this.assignments.list(query, user);
  }

  @Roles('admin')
  @Post()
  @ApiCreatedResponse({ type: TeachingAssignmentDto })
  create(
    @Body() body: CreateTeachingAssignmentDto,
    @CurrentUser() user: AuthUser,
  ): Promise<TeachingAssignmentDto> {
    return this.assignments.create(body, user);
  }

  @Roles('admin')
  @Delete(':id')
  @HttpCode(204)
  @ApiNoContentResponse()
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser): Promise<void> {
    return this.assignments.remove(id, user);
  }
}
