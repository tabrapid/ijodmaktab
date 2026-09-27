import { Module } from '@nestjs/common';
import { AvatarController } from './avatar.controller.js';
import { AvatarService } from './avatar.service.js';
import { UserImportService } from './user-import.service.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({
  controllers: [UsersController, AvatarController],
  providers: [UsersService, UserImportService, AvatarService],
  exports: [UsersService, AvatarService],
})
export class UsersModule {}
