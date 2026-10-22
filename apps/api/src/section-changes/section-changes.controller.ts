import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, Roles } from '../common/decorators.js';
import { ApiPaginatedResponse } from '../common/pagination.js';
import {
  ApproveSectionChangeDto,
  CreateSectionChangeDto,
  RejectSectionChangeDto,
  SectionChangeDto,
  SectionChangeListQueryDto,
} from './dto/section-change.dto.js';
import { SectionChangesService } from './section-changes.service.js';

@ApiTags('section-changes')
@ApiBearerAuth()
@Controller('section-changes')
export class SectionChangesController {
  constructor(private readonly sectionChanges: SectionChangesService) {}

  /** Requests, filterable by status (the Validations screen). */
  @Get()
  @Roles('admin')
  @ApiPaginatedResponse(SectionChangeDto)
  list(@Query() query: SectionChangeListQueryDto) {
    return this.sectionChanges.list(query);
  }

  /** The signed-in student's own requests, most recent first. */
  @Get('mine')
  @Roles('student')
  @ApiOkResponse({ type: [SectionChangeDto] })
  mine(@CurrentUser() user: AuthUser): Promise<SectionChangeDto[]> {
    return this.sectionChanges.mine(user);
  }

  /** A student asks for themself; an admin (the secretariat) asks for a student. One pending request at a time. */
  @Post()
  @Roles('student', 'admin')
  @ApiCreatedResponse({ type: SectionChangeDto })
  @ApiConflictResponse({ description: 'A request is already pending, or the account is archived.' })
  create(
    @Body() body: CreateSectionChangeDto,
    @CurrentUser() user: AuthUser,
  ): Promise<SectionChangeDto> {
    return this.sectionChanges.create(body, user);
  }

  /** Approves: moves the student to the class of the new section in one transaction (audited). */
  @Post(':id/approve')
  @Roles('admin')
  @HttpCode(200)
  @ApiOkResponse({ type: SectionChangeDto })
  @ApiConflictResponse({ description: 'Already decided, or the student changed meanwhile.' })
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ApproveSectionChangeDto,
    @CurrentUser() user: AuthUser,
  ): Promise<SectionChangeDto> {
    return this.sectionChanges.approve(id, body, user);
  }

  /** Rejects with a note shown to the student. */
  @Post(':id/reject')
  @Roles('admin')
  @HttpCode(200)
  @ApiOkResponse({ type: SectionChangeDto })
  @ApiConflictResponse({ description: 'Already decided.' })
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RejectSectionChangeDto,
    @CurrentUser() user: AuthUser,
  ): Promise<SectionChangeDto> {
    return this.sectionChanges.reject(id, body, user);
  }
}
