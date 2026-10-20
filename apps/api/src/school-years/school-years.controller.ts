import {
  Body,
  Controller,
  Get,
  Param,
  ParseBoolPipe,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../common/decorators.js';
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
  @ApiOkResponse({ type: SchoolYearDto })
  makeCurrent(@Param('id', ParseUUIDPipe) id: string): Promise<SchoolYearDto> {
    return this.years.makeCurrent(id);
  }

  @Roles('admin')
  @Post('school-years/:id/terms')
  @ApiCreatedResponse({ type: TermDto })
  addTerm(@Param('id', ParseUUIDPipe) id: string, @Body() body: CreateTermDto): Promise<TermDto> {
    return this.years.addTerm(id, body);
  }

  /** Closes a term (`?closed=false` reopens it). */
  @Roles('admin')
  @Post('terms/:id/close')
  @ApiQuery({ name: 'closed', required: false, type: Boolean })
  @ApiOkResponse({ type: TermDto })
  close(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('closed', new ParseBoolPipe({ optional: true })) closed?: boolean,
  ): Promise<TermDto> {
    return this.years.closeTerm(id, closed ?? true);
  }
}
