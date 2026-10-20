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
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Paginated } from '@cdls/shared';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, Public, Roles } from '../common/decorators.js';
import { ApiPaginatedResponse } from '../common/pagination.js';
import { ContactService } from './contact.service.js';
import {
  ContactMessageDto,
  ContactMessageListQueryDto,
  CreateContactMessageDto,
  UpdateContactMessageDto,
} from './dto/contact.dto.js';

/** Read per request from the validated environment (defaults to 5). */
function contactLimit(): number {
  return Number(process.env['CONTACT_THROTTLE_LIMIT'] ?? 5) || 5;
}

@ApiTags('contact')
@Controller()
export class ContactController {
  constructor(private readonly contact: ContactService) {}

  /** Public contact form: stores the message for the secretariat. Limited to CONTACT_THROTTLE_LIMIT (5) a minute. */
  @Public()
  @Throttle({ default: { limit: contactLimit, ttl: 60_000 } })
  @Post('contact')
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'Message stored.' })
  @ApiTooManyRequestsResponse({ description: 'Too many messages from this client; retry later.' })
  create(@Body() body: CreateContactMessageDto): Promise<void> {
    return this.contact.create(body);
  }

  /** Messages from the contact form, newest first (admins). */
  @Roles('admin')
  @ApiBearerAuth()
  @Get('contact-messages')
  @ApiPaginatedResponse(ContactMessageDto)
  list(@Query() query: ContactMessageListQueryDto): Promise<Paginated<ContactMessageDto>> {
    return this.contact.list(query);
  }

  /** Marks a message handled, or waiting again (admins). */
  @Roles('admin')
  @ApiBearerAuth()
  @Patch('contact-messages/:id')
  @ApiOkResponse({ type: ContactMessageDto })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateContactMessageDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ContactMessageDto> {
    return this.contact.setHandled(id, body.handled, user);
  }
}
