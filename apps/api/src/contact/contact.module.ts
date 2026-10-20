import { Module } from '@nestjs/common';
import { ContactRetentionService } from './contact-retention.service.js';
import { ContactController } from './contact.controller.js';
import { ContactService } from './contact.service.js';

@Module({
  controllers: [ContactController],
  providers: [ContactService, ContactRetentionService],
})
export class ContactModule {}
