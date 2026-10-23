import { Module } from '@nestjs/common';
import { TargetsModule } from '../targets/targets.module.js';
import { ChangeNoticesService } from './change-notices.service.js';
import { NotificationMailService } from './notification-mail.service.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';

/**
 * In-app notifications (and their optional e-mail digest). The timetable, events and grades modules import
 * it for `ChangeNoticesService`, which they call inside their own transactions.
 */
@Module({
  imports: [TargetsModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, ChangeNoticesService, NotificationMailService],
  exports: [ChangeNoticesService],
})
export class NotificationsModule {}
