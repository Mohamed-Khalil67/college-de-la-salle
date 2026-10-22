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
import { ActivityTypesService } from './activity-types.service.js';
import {
  ActivityTypeDto,
  ActivityTypeListQueryDto,
  CreateActivityTypeDto,
  UpdateActivityTypeDto,
} from './dto/activity-type.dto.js';

@ApiTags('activity-types')
@ApiBearerAuth()
@Roles('admin', 'teacher')
@Controller('activity-types')
export class ActivityTypesController {
  constructor(private readonly types: ActivityTypesService) {}

  /** School-wide types plus the teacher's own (the admin: every type), system types first. */
  @Get()
  @ApiOkResponse({ type: [ActivityTypeDto] })
  list(
    @Query() query: ActivityTypeListQueryDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ActivityTypeDto[]> {
    return this.types.list(query, user);
  }

  /** A teacher creates a private type; the admin a school-wide one. */
  @Post()
  @ApiCreatedResponse({ type: ActivityTypeDto })
  create(
    @Body() body: CreateActivityTypeDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ActivityTypeDto> {
    return this.types.create(body, user);
  }

  /** The owner or the admin. Flags are locked on system types and once events use the type. */
  @Patch(':id')
  @ApiOkResponse({ type: ActivityTypeDto })
  @ApiConflictResponse({ description: 'Flags of a type that events use.' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateActivityTypeDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ActivityTypeDto> {
    return this.types.update(id, body, user);
  }

  /** The owner or the admin; not system types; 409 when events use it (archive it instead). */
  @Delete(':id')
  @HttpCode(204)
  @ApiNoContentResponse()
  @ApiConflictResponse({ description: 'Events use this type.' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser): Promise<void> {
    return this.types.remove(id, user);
  }

  /** Admin only: makes a teacher's private type school-wide. */
  @Roles('admin')
  @Post(':id/promote')
  @HttpCode(200)
  @ApiOkResponse({ type: ActivityTypeDto })
  @ApiConflictResponse({ description: 'Already school-wide, or archived.' })
  promote(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<ActivityTypeDto> {
    return this.types.promote(id, user);
  }
}
