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
import { CreateSchoolYearDto, SchoolYearDto, UpdateSchoolYearDto } from './dto/school-year.dto.js';
import { SchoolYearsService } from './school-years.service.js';

@ApiTags('school-years')
@ApiBearerAuth()
@Controller('school-years')
export class SchoolYearsController {
  constructor(private readonly years: SchoolYearsService) {}

  /** Every school year with its periods, newest first. */
  @Get()
  @ApiOkResponse({ type: [SchoolYearDto] })
  list(): Promise<SchoolYearDto[]> {
    return this.years.list();
  }

  /** Admin or coordinator. */
  @StructureEditors()
  @Post()
  @ApiCreatedResponse({ type: SchoolYearDto })
  create(@Body() body: CreateSchoolYearDto, @CurrentUser() user: AuthUser): Promise<SchoolYearDto> {
    return this.years.create(body, user);
  }

  /** Admin or coordinator: label and dates (409 if periods or calendar days would fall outside). */
  @StructureEditors()
  @Patch(':id')
  @ApiOkResponse({ type: SchoolYearDto })
  @ApiConflictResponse({
    description: 'Periods or calendar days would fall outside the new dates.',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateSchoolYearDto,
    @CurrentUser() user: AuthUser,
  ): Promise<SchoolYearDto> {
    return this.years.update(id, body, user);
  }

  /** Admin: makes this the current school year. */
  @Roles('admin')
  @Post(':id/current')
  @HttpCode(200)
  @ApiOkResponse({ type: SchoolYearDto })
  makeCurrent(@Param('id', ParseUUIDPipe) id: string): Promise<SchoolYearDto> {
    return this.years.makeCurrent(id);
  }

  /** Admin: deletes a school year that is not the current one and has no classes; 409 otherwise. */
  @Roles('admin')
  @Delete(':id')
  @HttpCode(204)
  @ApiNoContentResponse()
  @ApiConflictResponse({ description: 'The current year, or a year that still has classes.' })
  removeYear(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser): Promise<void> {
    return this.years.removeYear(id, user);
  }
}
