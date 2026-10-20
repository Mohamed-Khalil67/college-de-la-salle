import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, Roles } from '../common/decorators.js';
import { ApiPaginatedResponse } from '../common/pagination.js';
import {
  CreatedUserDto,
  CreateUserDto,
  ImportUsersDto,
  UpdateUserDto,
  UserDto,
  UserListQueryDto,
} from './dto/user.dto.js';
import { UsersService } from './users.service.js';

@ApiTags('users')
@ApiBearerAuth()
@Roles('admin')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /** Paginated list, filterable by role and searchable by name or e-mail. */
  @Get()
  @ApiPaginatedResponse(UserDto)
  list(@Query() query: UserListQueryDto) {
    return this.users.list(query);
  }

  @Get(':id')
  @ApiOkResponse({ type: UserDto })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<UserDto> {
    return this.users.get(id);
  }

  /** Creates an account (no open sign-up). Without a password, a temporary one is returned once. */
  @Post()
  @ApiCreatedResponse({ type: CreatedUserDto })
  create(@Body() body: CreateUserDto): Promise<CreatedUserDto> {
    return this.users.create(body);
  }

  /** CSV import (multipart field `file`, 1 MB max), all or nothing. */
  @Post('import')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 1024 * 1024, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @ApiCreatedResponse({ type: ImportUsersDto })
  @ApiBadRequestResponse({
    description: 'Invalid rows, listed in `errors` with their line number; nothing was created.',
  })
  import(@UploadedFile() file: Express.Multer.File | undefined): Promise<ImportUsersDto> {
    return this.users.importCsv(file?.buffer);
  }

  @Patch(':id')
  @ApiOkResponse({ type: UserDto })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateUserDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<UserDto> {
    return this.users.update(id, body, actor);
  }

  /** Deactivates the account and signs it out everywhere (records are kept). */
  @Delete(':id')
  @ApiOkResponse({ type: UserDto })
  deactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<UserDto> {
    return this.users.deactivate(id, actor);
  }
}
