import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseBoolPipe,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, Roles } from '../common/decorators.js';
import {
  CreateSchoolYearDto,
  CreateTermDto,
  SchoolYearDto,
  TermDto,
} from './dto/school-year.dto.js';
import { SchoolYearsService } from './school-years.service.js';

@ApiTags('school-years')
@ApiBearerAuth()
@Controller()
export class SchoolYearsController {
  constructor(private readonly years: SchoolYearsService) {}

  /** Every school year with its terms, newest first. */
  @Get('school-years')
  @ApiOkResponse({ type: [SchoolYearDto] })
  list(): Promise<SchoolYearDto[]> {
    return this.years.list();
  }

  @Roles('admin')
  @Post('school-years')
  @ApiCreatedResponse({ type: SchoolYearDto })
  create(@Body() body: CreateSchoolYearDto): Promise<SchoolYearDto> {
    return this.years.create(body);
  }

  /** Makes this the current school year. */
  @Roles('admin')
  @Post('school-years/:id/current')
  @HttpCode(200)
  @ApiOkResponse({ type: SchoolYearDto })
  makeCurrent(@Param('id', ParseUUIDPipe) id: string): Promise<SchoolYearDto> {
    return this.years.makeCurrent(id);
  }

  /** Deletes a school year that is not the current one and has no classes; 409 otherwise. */
  @Roles('admin')
  @Delete('school-years/:id')
  @HttpCode(204)
  @ApiNoContentResponse()
  @ApiConflictResponse({ description: 'The current year, or a year that still has classes.' })
  removeYear(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser): Promise<void> {
    return this.years.removeYear(id, user);
  }

  @Roles('admin')
  @Post('school-years/:id/terms')
  @ApiCreatedResponse({ type: TermDto })
  addTerm(@Param('id', ParseUUIDPipe) id: string, @Body() body: CreateTermDto): Promise<TermDto> {
    return this.years.addTerm(id, body);
  }

  /** Deletes a term without grades or report cards; 409 otherwise. */
  @Roles('admin')
  @Delete('terms/:id')
  @HttpCode(204)
  @ApiNoContentResponse()
  @ApiConflictResponse({
    description: 'Grades were entered during the term, or it has report cards.',
  })
  removeTerm(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser): Promise<void> {
    return this.years.removeTerm(id, user);
  }

  /** Closes a term (`?closed=false` reopens it). */
  @Roles('admin')
  @Post('terms/:id/close')
  @HttpCode(200)
  @ApiQuery({ name: 'closed', required: false, type: Boolean })
  @ApiOkResponse({ type: TermDto })
  close(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('closed', new ParseBoolPipe({ optional: true })) closed?: boolean,
  ): Promise<TermDto> {
    return this.years.closeTerm(id, closed ?? true);
  }
}
