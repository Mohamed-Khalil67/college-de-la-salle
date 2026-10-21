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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, Roles } from '../common/decorators.js';
import { ApiPaginatedResponse } from '../common/pagination.js';
import {
  ArchiveStudentsDto,
  ArchiveStudentsResultDto,
  CreatedUserDto,
  CreateUserDto,
  ImportPreviewDto,
  ImportUsersDto,
  ImportUsersQueryDto,
  UpdateUserDto,
  UserDto,
  UserListQueryDto,
} from './dto/user.dto.js';
import { UsersService } from './users.service.js';

const CSV_BODY = {
  type: 'object',
  properties: { file: { type: 'string', format: 'binary' } },
  required: ['file'],
};

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

  /**
   * Creates an account (no open sign-up) with a temporary password, returned once. Without an e-mail the
   * school address prenom.nom@<SCHOOL_EMAIL_DOMAIN> is generated.
   */
  @Post()
  @ApiCreatedResponse({ type: CreatedUserDto })
  create(@Body() body: CreateUserDto): Promise<CreatedUserDto> {
    return this.users.create(body);
  }

  /** Roster CSV check (multipart field `file`, 1 MB max): the accounts it would create and the errors. */
  @Post('import/preview')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 1024 * 1024, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: CSV_BODY })
  @ApiQuery({ name: 'role', enum: ['student', 'teacher'] })
  @ApiOkResponse({ type: ImportPreviewDto })
  previewImport(
    @Query() query: ImportUsersQueryDto,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<ImportPreviewDto> {
    return this.users.previewImport(file?.buffer, query.role);
  }

  /** Roster CSV import, all or nothing: generated e-mails, temporary passwords returned once. */
  @Post('import')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 1024 * 1024, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: CSV_BODY })
  @ApiQuery({ name: 'role', enum: ['student', 'teacher'] })
  @ApiCreatedResponse({ type: ImportUsersDto })
  @ApiBadRequestResponse({
    description: 'Invalid rows, listed in `errors` with their line number; nothing was created.',
  })
  import(
    @Query() query: ImportUsersQueryDto,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<ImportUsersDto> {
    return this.users.importCsv(file?.buffer, query.role);
  }

  /**
   * Students who graduated or left (by id, or a whole class): accounts archived (no sign-in, read-only),
   * open enrolments closed, pending section changes rejected, sessions ended.
   */
  @Post('archive')
  @HttpCode(200)
  @ApiOkResponse({ type: ArchiveStudentsResultDto })
  archive(
    @Body() body: ArchiveStudentsDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<ArchiveStudentsResultDto> {
    return this.users.archiveStudents(body, actor);
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

  /** Disables the account and signs it out everywhere (records are kept). */
  @Delete(':id')
  @ApiOkResponse({ type: UserDto })
  deactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<UserDto> {
    return this.users.deactivate(id, actor);
  }
}
