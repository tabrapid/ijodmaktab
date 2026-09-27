import { Controller, Delete, HttpCode, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { AVATAR_MAX_BYTES } from '@ijod/shared';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser } from '../common/decorators.js';
import type { UploadedFileData } from '../common/uploaded-file.js';
import { AvatarService } from './avatar.service.js';

/** O‘z profil rasmi: har bir tizimga kirgan foydalanuvchi uchun (maktab va tizim hisoblari). */
@Controller('me/avatar')
export class AvatarController {
  constructor(private readonly avatars: AvatarService) {}

  @Post()
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: AVATAR_MAX_BYTES, files: 1 } }))
  upload(@CurrentUser() user: AuthUser, @UploadedFile() file?: UploadedFileData) {
    return this.avatars.upload(user, file);
  }

  @Delete()
  remove(@CurrentUser() user: AuthUser) {
    return this.avatars.removeOwn(user);
  }
}
