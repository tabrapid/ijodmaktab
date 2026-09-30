import { Module } from '@nestjs/common';
import { RegistrationController } from './registration.controller.js';
import { RegistrationService } from './registration.service.js';
import { RegistrationsController } from './registrations.controller.js';

/** O‘zi ro‘yxatdan o‘tish (ochiq sahifalar) va arizalarni ko‘rib chiqish (direktor o‘rinbosari). */
@Module({
  controllers: [RegistrationController, RegistrationsController],
  providers: [RegistrationService],
})
export class RegistrationModule {}
