import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiNoContentResponse, ApiTags } from '@nestjs/swagger';
import type { Paginated } from '@cdls/shared';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, Roles } from '../common/decorators.js';
import { ApiPaginatedResponse } from '../common/pagination.js';
import { CreatePostDto, PostDto, PostListQueryDto } from './dto/post.dto.js';
import { PostsService } from './posts.service.js';

@ApiTags('posts')
@ApiBearerAuth()
@Controller('posts')
export class PostsController {
  constructor(private readonly posts: PostsService) {}

  /** Newest first, paginated. Students only get the posts addressed to them. */
  @Get()
  @ApiPaginatedResponse(PostDto)
  list(
    @Query() query: PostListQueryDto,
    @CurrentUser() user: AuthUser,
  ): Promise<Paginated<PostDto>> {
    return this.posts.list(query, user);
  }

  /** Teachers: to a class they teach, a section or the whole school. Admins: anywhere. */
  @Roles('teacher', 'admin')
  @Post()
  @ApiCreatedResponse({ type: PostDto })
  create(@Body() body: CreatePostDto, @CurrentUser() user: AuthUser): Promise<PostDto> {
    return this.posts.create(body, user);
  }

  /** The author or an admin. */
  @Roles('teacher', 'admin')
  @Delete(':id')
  @HttpCode(204)
  @ApiNoContentResponse()
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser): Promise<void> {
    return this.posts.remove(id, user);
  }
}
