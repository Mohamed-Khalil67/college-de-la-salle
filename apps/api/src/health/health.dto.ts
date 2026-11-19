import type { HealthStatus, LiveHealth } from '@cdls/shared';
import { ApiProperty } from '@nestjs/swagger';

export class HealthDto implements HealthStatus {
  @ApiProperty({ example: 'ok' })
  status: 'ok';
}

export class LiveHealthDto extends HealthDto implements LiveHealth {
  @ApiProperty({ example: '0.1.0' })
  version: string;

  @ApiProperty({ type: String, nullable: true, example: '20261113000000_events_creator' })
  migration: string | null;
}
