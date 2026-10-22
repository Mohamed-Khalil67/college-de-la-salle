import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { RolloverPreview, RolloverResult } from '@cdls/shared';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, Roles } from '../common/decorators.js';
import {
  RolloverApplyDto,
  RolloverPreviewDto,
  RolloverRequestDto,
  RolloverResultDto,
} from './dto/rollover.dto.js';
import { RolloverService } from './rollover.service.js';

/** The next-year wizard. Admin only: coordinators do not run the rollover. */
@ApiTags('rollover')
@ApiBearerAuth()
@Roles('admin')
@Controller('rollover')
export class RolloverController {
  constructor(private readonly rollover: RolloverService) {}

  /**
   * What the rollover would create, skip and flag for the chosen source year, with the proposed outcome of
   * every student and a `planHash`. Writes nothing.
   */
  @Post('preview')
  @HttpCode(200)
  @ApiOkResponse({ type: RolloverPreviewDto })
  preview(
    @Body() body: RolloverRequestDto,
    @CurrentUser() user: AuthUser,
  ): Promise<RolloverPreview> {
    return this.rollover.preview(body, user);
  }

  /**
   * Runs the plan in one transaction and archives the old year. 409 `ROLLOVER_PREVIEW_STALE` when the data
   * changed since the preview (`planHash`); running it again creates nothing twice.
   */
  @Post('apply')
  @ApiCreatedResponse({ type: RolloverResultDto })
  @ApiConflictResponse({ description: 'The preview is stale, or the new year is archived.' })
  apply(@Body() body: RolloverApplyDto, @CurrentUser() user: AuthUser): Promise<RolloverResult> {
    return this.rollover.apply(body, user);
  }
}
