import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  ParseBoolPipe,
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
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, Roles, StructureEditors } from '../common/decorators.js';
import { CreatePeriodDto, PeriodDto, UpdatePeriodDto } from './dto/period.dto.js';
import { PeriodsService } from './periods.service.js';

@ApiTags('periods')
@ApiBearerAuth()
@Controller()
export class PeriodsController {
  constructor(private readonly periods: PeriodsService) {}

  /** Admin or coordinator. 409 when it overlaps a period of the same kind and section. */
  @StructureEditors()
  @Post('school-years/:id/periods')
  @ApiCreatedResponse({ type: PeriodDto })
  @ApiConflictResponse({ description: 'Overlaps another period of the same kind and section.' })
  create(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CreatePeriodDto,
    @CurrentUser() user: AuthUser,
  ): Promise<PeriodDto> {
    return this.periods.create(id, body, user);
  }

  /** Admin or coordinator. A closed period is locked (409). Grades never move with the dates. */
  @StructureEditors()
  @Patch('periods/:id')
  @ApiOkResponse({ type: PeriodDto })
  @ApiConflictResponse({ description: 'Closed period, or overlap.' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdatePeriodDto,
    @CurrentUser() user: AuthUser,
  ): Promise<PeriodDto> {
    return this.periods.update(id, body, user);
  }

  /** Admin or coordinator; 409 when it has report cards or grades. */
  @StructureEditors()
  @Delete('periods/:id')
  @HttpCode(204)
  @ApiNoContentResponse()
  @ApiConflictResponse({ description: 'Report cards or grades exist, or the period is closed.' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser): Promise<void> {
    return this.periods.remove(id, user);
  }

  /** Admin: closes a period, which locks it and allows report cards (`?closed=false` reopens it). */
  @Roles('admin')
  @Post('periods/:id/close')
  @HttpCode(200)
  @ApiQuery({ name: 'closed', required: false, type: Boolean })
  @ApiOkResponse({ type: PeriodDto })
  close(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Query('closed', new ParseBoolPipe({ optional: true })) closed?: boolean,
  ): Promise<PeriodDto> {
    return this.periods.close(id, closed ?? true, user);
  }
}
