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
import {
  AddGroupMembersDto,
  CreateGroupDto,
  GroupDetailDto,
  GroupListQueryDto,
  GroupWithMembersDto,
  MyGroupDto,
  UpdateGroupDto,
} from './dto/group.dto.js';
import { GroupsService } from './groups.service.js';

/**
 * Groups of a class. Admins and coordinators manage any group, a teacher those of the classes they teach
 * (checked in the service on the group's own class), a student reads only `GET /groups/mine`.
 */
@ApiTags('groups')
@ApiBearerAuth()
@Controller('groups')
export class GroupsController {
  constructor(private readonly groups: GroupsService) {}

  /** The signed-in student's current groups. */
  @Roles('student')
  @Get('mine')
  @ApiOkResponse({ type: [MyGroupDto] })
  mine(@CurrentUser() user: AuthUser): Promise<MyGroupDto[]> {
    return this.groups.mine(user);
  }

  /** The groups of a class with their members' ids (`classId` required). */
  @Roles('admin', 'teacher')
  @Get()
  @ApiOkResponse({ type: [GroupWithMembersDto] })
  list(
    @Query() query: GroupListQueryDto,
    @CurrentUser() user: AuthUser,
  ): Promise<GroupWithMembersDto[]> {
    return this.groups.list(query.classId, user);
  }

  @Roles('admin', 'teacher')
  @Get(':id')
  @ApiOkResponse({ type: GroupDetailDto })
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser): Promise<GroupDetailDto> {
    return this.groups.get(id, user);
  }

  @Roles('admin', 'teacher')
  @Post()
  @ApiCreatedResponse({ type: GroupDetailDto })
  @ApiConflictResponse({ description: 'The group already exists in that division.' })
  create(@Body() body: CreateGroupDto, @CurrentUser() user: AuthUser): Promise<GroupDetailDto> {
    return this.groups.create(body, user);
  }

  @Roles('admin', 'teacher')
  @Patch(':id')
  @ApiOkResponse({ type: GroupDetailDto })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateGroupDto,
    @CurrentUser() user: AuthUser,
  ): Promise<GroupDetailDto> {
    return this.groups.update(id, body, user);
  }

  /** 409 while timetable sessions or assigned work use the group. */
  @Roles('admin', 'teacher')
  @Delete(':id')
  @HttpCode(204)
  @ApiNoContentResponse()
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser): Promise<void> {
    return this.groups.remove(id, user);
  }

  /** Adds students; 409 when one is already in another group of the same division (unless `move`). */
  @Roles('admin', 'teacher')
  @Post(':id/members')
  @ApiCreatedResponse({ type: GroupDetailDto })
  addMembers(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AddGroupMembersDto,
    @CurrentUser() user: AuthUser,
  ): Promise<GroupDetailDto> {
    return this.groups.addMembers(id, body, user);
  }

  @Roles('admin', 'teacher')
  @Delete(':id/members/:studentId')
  @ApiOkResponse({ type: GroupDetailDto })
  removeMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<GroupDetailDto> {
    return this.groups.removeMember(id, studentId, user);
  }
}
