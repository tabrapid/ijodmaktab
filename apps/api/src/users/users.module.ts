import { Module } from '@nestjs/common';
import { UserImportService } from './user-import.service.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({
  controllers: [UsersController],
  providers: [UsersService, UserImportService],
  exports: [UsersService],
})
export class UsersModule {}
