import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, Roles } from '../common/decorators.js';
import {
  ReportCardBatchDto,
  ReportCardBatchResultDto,
  ReportCardDto,
  ReportCardListQueryDto,
  UpdateReportCardDto,
} from './dto/report-card.dto.js';
import { ReportCardsService } from './report-cards.service.js';

@ApiTags('report-cards')
@ApiBearerAuth()
@Controller()
export class ReportCardsController {
  constructor(private readonly cards: ReportCardsService) {}

  /** Computes the period's (unpublished) report cards from published grades. The period must be closed. */
  @Roles('admin')
  @Post('periods/:id/report-cards/generate')
  @HttpCode(200)
  @ApiOkResponse({ type: ReportCardBatchResultDto })
  generate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ReportCardBatchDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ReportCardBatchResultDto> {
    return this.cards.generate(id, body.classId, user);
  }

  /** Makes the generated report cards visible to the students. */
  @Roles('admin')
  @Post('periods/:id/report-cards/publish')
  @HttpCode(200)
  @ApiOkResponse({ type: ReportCardBatchResultDto })
  publish(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ReportCardBatchDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ReportCardBatchResultDto> {
    return this.cards.publish(id, body.classId, user);
  }

  /** A period's report cards. Teachers must name a class they teach. */
  @Roles('admin', 'teacher')
  @Get('periods/:id/report-cards')
  @ApiOkResponse({ type: [ReportCardDto] })
  forPeriod(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ReportCardListQueryDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ReportCardDto[]> {
    return this.cards.forPeriod(id, query.classId, user);
  }

  /** A student's report cards. Students: their own, published only. */
  @Get('students/:id/report-cards')
  @ApiOkResponse({ type: [ReportCardDto] })
  forStudent(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<ReportCardDto[]> {
    return this.cards.forStudent(id, user);
  }

  /** The appreciation, before publication (admins and the class's teachers). */
  @Roles('admin', 'teacher')
  @Patch('report-cards/:id')
  @ApiOkResponse({ type: ReportCardDto })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateReportCardDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ReportCardDto> {
    return this.cards.updateAppreciation(id, body.appreciation, user);
  }

  /** The report card as a PDF. */
  @Get('report-cards/:id/pdf')
  @ApiProduces('application/pdf')
  async pdf(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<StreamableFile> {
    const { filename, content } = await this.cards.pdf(id, user);
    return new StreamableFile(content, {
      type: 'application/pdf',
      disposition: `attachment; filename="${filename}"`,
    });
  }
}
