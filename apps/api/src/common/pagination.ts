import { applyDecorators, type Type } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, ApiPropertyOptional, getSchemaPath } from '@nestjs/swagger';
import { Type as TransformType } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, type PageQuery, type Paginated } from '@cdls/shared';

export class PaginationQueryDto implements PageQuery {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @TransformType(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE_SIZE, default: DEFAULT_PAGE_SIZE })
  @IsOptional()
  @TransformType(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize = DEFAULT_PAGE_SIZE;
}

/** Prisma `skip` / `take` for a page. */
export function pageArgs(query: PageQuery): { skip: number; take: number } {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
  return { skip: (page - 1) * pageSize, take: pageSize };
}

export function paginated<T>(items: T[], total: number, query: PageQuery): Paginated<T> {
  return { items, total, page: query.page ?? 1, pageSize: query.pageSize ?? DEFAULT_PAGE_SIZE };
}

/** Swagger schema for a `Paginated<model>` response. */
export function ApiPaginatedResponse(model: Type<unknown>) {
  return applyDecorators(
    ApiExtraModels(model),
    ApiOkResponse({
      schema: {
        type: 'object',
        required: ['items', 'total', 'page', 'pageSize'],
        properties: {
          items: { type: 'array', items: { $ref: getSchemaPath(model) } },
          total: { type: 'integer' },
          page: { type: 'integer' },
          pageSize: { type: 'integer' },
        },
      },
    }),
  );
}
