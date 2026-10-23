import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import {
  type MarkNotificationsReadResponse,
  NOTIFICATION_KINDS,
  type NotificationDto as NotificationContract,
  type NotificationKind,
  type NotificationListQuery,
  type NotificationPreferencesDto as NotificationPreferencesContract,
  type NotificationSummaryDto as NotificationSummaryContract,
  type UpdateNotificationPreferencesRequest,
} from '@cdls/shared';
import { PaginationQueryDto } from '../../common/pagination.js';
import { queryBoolean } from '../../common/transforms.js';

export class NotificationDto implements NotificationContract {
  id: string;
  @ApiProperty({ enum: NOTIFICATION_KINDS })
  kind: NotificationKind;
  title: string;
  body: string;
  @ApiProperty({ type: String, nullable: true })
  link: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'YYYY-MM-DD' })
  occursOn: string | null;
  createdAt: string;
  @ApiProperty({ type: String, nullable: true })
  readAt: string | null;
}

export class NotificationListQueryDto extends PaginationQueryDto implements NotificationListQuery {
  /** true: unread only. */
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(queryBoolean)
  @IsBoolean()
  unread?: boolean;
}

export class NotificationSummaryDto implements NotificationSummaryContract {
  unread: number;
}

export class MarkNotificationsReadResponseDto implements MarkNotificationsReadResponse {
  updated: number;
}

export class NotificationPreferencesDto implements NotificationPreferencesContract {
  emailEnabled: boolean;
}

export class UpdateNotificationPreferencesDto implements UpdateNotificationPreferencesRequest {
  @IsBoolean()
  emailEnabled: boolean;
}
