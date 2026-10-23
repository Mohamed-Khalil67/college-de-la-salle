import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';
import type {
  CalendarFeedCreatedDto as CalendarFeedCreatedContract,
  CalendarFeedDto as CalendarFeedContract,
} from '@cdls/shared';

export class CalendarFeedDto implements CalendarFeedContract {
  active: boolean;
  @ApiProperty({ type: String, nullable: true })
  createdAt: string | null;
  @ApiProperty({ type: String, nullable: true })
  lastUsedAt: string | null;
}

export class CalendarFeedCreatedDto extends CalendarFeedDto implements CalendarFeedCreatedContract {
  /** @example https://www.lasalle-daher.eg/api/calendar/feed/0193…AbC.ics */
  url: string;
}

/**
 * The file name of the feed: `<token>.ics`. Only its length is checked here; any malformed, unknown,
 * revoked or outdated token gets the same 404 from the service (never a 400 that says which).
 */
export class CalendarFeedFileParamDto {
  @IsString()
  @MaxLength(100)
  file: string;
}
