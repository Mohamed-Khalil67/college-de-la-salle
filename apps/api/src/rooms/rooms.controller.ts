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
import { CreateRoomDto, RoomDto, UpdateRoomDto } from './dto/room.dto.js';
import { RoomsService } from './rooms.service.js';

@ApiTags('rooms')
@ApiBearerAuth()
@Controller('rooms')
export class RoomsController {
  constructor(private readonly rooms: RoomsService) {}

  /** Every room, active ones first (staff). */
  @Roles('admin', 'teacher')
  @Get()
  @ApiOkResponse({ type: [RoomDto] })
  list(): Promise<RoomDto[]> {
    return this.rooms.list();
  }

  /** Admin or coordinator. */
  @StructureEditors()
  @Post()
  @ApiCreatedResponse({ type: RoomDto })
  @ApiConflictResponse({ description: 'A room already has this name.' })
  create(@Body() body: CreateRoomDto, @CurrentUser() user: AuthUser): Promise<RoomDto> {
    return this.rooms.create(body, user);
  }

  /** Admin or coordinator (set `active: false` to retire a room). */
  @StructureEditors()
  @Patch(':id')
  @ApiOkResponse({ type: RoomDto })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateRoomDto,
    @CurrentUser() user: AuthUser,
  ): Promise<RoomDto> {
    return this.rooms.update(id, body, user);
  }

  /** Admin or coordinator; 409 when events use the room. */
  @StructureEditors()
  @Delete(':id')
  @HttpCode(204)
  @ApiNoContentResponse()
  @ApiConflictResponse({ description: 'Events use this room.' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser): Promise<void> {
    return this.rooms.remove(id, user);
  }
}
