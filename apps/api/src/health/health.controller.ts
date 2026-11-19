import { Controller, Get, NotFoundException, Req } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public } from '../common/decorators.js';
import { HealthService } from './health.service.js';
import { HealthDto, LiveHealthDto } from './health.dto.js';
import { cameThroughProxy } from './proxied.js';

@ApiTags('health')
@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /**
   * Liveness: the process is up, with the API version and the last applied migration (cached at start).
   * Does not touch the database. Public, not rate-limited (container healthcheck).
   */
  @Get()
  @ApiOkResponse({ type: LiveHealthDto })
  live(): LiveHealthDto {
    return this.health.live();
  }

  /**
   * Readiness: the database answers. Only for callers inside the stack (the API container, the host in
   * development): a request that came through a reverse proxy (X-Forwarded-For, X-Real-IP or Forwarded
   * set, as the web container's nginx always does) gets 404, and the route counts against the rate limit.
   */
  @Get('db')
  @SkipThrottle({ default: false })
  @ApiOkResponse({ type: HealthDto })
  @ApiNotFoundResponse({ description: 'Asked through the reverse proxy.' })
  @ApiServiceUnavailableResponse({ description: 'PostgreSQL is unreachable.' })
  async database(@Req() req: Pick<Request, 'headers'>): Promise<HealthDto> {
    if (cameThroughProxy(req.headers)) throw new NotFoundException();
    return this.health.checkDatabase();
  }
}
