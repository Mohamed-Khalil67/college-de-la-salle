import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../common/decorators.js';
import { HealthService } from './health.service.js';
import { HealthDto } from './health.dto.js';

@ApiTags('health')
@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /** Liveness: the process is up. Does not touch the database. */
  @Get()
  @ApiOkResponse({ type: HealthDto })
  live(): HealthDto {
    return { status: 'ok' };
  }

  /** Readiness: the database answers. */
  @Get('db')
  @ApiOkResponse({ type: HealthDto })
  @ApiServiceUnavailableResponse({ description: 'PostgreSQL is unreachable.' })
  database(): Promise<HealthDto> {
    return this.health.checkDatabase();
  }
}
