import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  createUserSchema,
  importMappingSchema,
  setRolesSchema,
  setUserStatusSchema,
  updateUserSchema,
  userListQuerySchema,
} from '@ijod/shared';
import type { Response } from 'express';
import type { z } from 'zod';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, Roles } from '../common/decorators.js';
import type { UploadedFileData } from '../common/uploaded-file.js';
import { Uuid } from '../common/uuid.pipe.js';
import { XLSX_MIME } from '../common/xlsx.js';
import { zod } from '../common/zod.pipe.js';
import { IMPORT_MAX_BYTES, UserImportService } from './user-import.service.js';
import { UsersService } from './users.service.js';

/**
 * Hisoblarni boshqaruvchilar. Direktor o‘rinbosari faqat o‘qituvchi va o‘quvchi hisoblari bilan
 * ishlaydi — bu cheklov xizmat qatlamida (UsersService) tekshiriladi.
 */
const ACCOUNT_MANAGERS = ['DEPUTY', 'ADMIN', 'SUPER_ADMIN'] as const;

@Controller('users')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly imports: UserImportService,
  ) {}

  @Get()
  @Roles('TEACHER', 'DEPUTY', 'ADMIN', 'SUPER_ADMIN')
  list(@CurrentUser() user: AuthUser, @Query(zod(userListQuerySchema)) query: z.output<typeof userListQuerySchema>) {
    return this.users.list(user, query);
  }

  /** Xodimlar ro‘yxati: test ulashish va o‘tkazuvchi tanlash uchun. */
  @Get('staff')
  @Roles('TEACHER', 'DEPUTY', 'ADMIN', 'SUPER_ADMIN')
  staff(@Query('q') q?: string) {
    return this.users.staffDirectory(typeof q === 'string' ? q.slice(0, 100) : undefined);
  }

  @Post('import')
  @Roles(...ACCOUNT_MANAGERS)
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: IMPORT_MAX_BYTES, files: 1 } }))
  upload(@CurrentUser() user: AuthUser, @UploadedFile() file?: UploadedFileData) {
    return this.imports.upload(user, file);
  }

  @Post('import/:batchId/preview')
  @Roles(...ACCOUNT_MANAGERS)
  @HttpCode(200)
  preview(
    @CurrentUser() user: AuthUser,
    @Param('batchId', Uuid) batchId: string,
    @Body(zod(importMappingSchema)) body: z.output<typeof importMappingSchema>,
  ) {
    return this.imports.preview(user, batchId, body);
  }

  @Post('import/:batchId/commit')
  @Roles(...ACCOUNT_MANAGERS)
  @HttpCode(200)
  commit(
    @CurrentUser() user: AuthUser,
    @Param('batchId', Uuid) batchId: string,
    @Body(zod(importMappingSchema)) body: z.output<typeof importMappingSchema>,
  ) {
    return this.imports.commit(user, batchId, body);
  }

  @Get('import/:batchId/errors.xlsx')
  @Roles(...ACCOUNT_MANAGERS)
  async importErrors(@CurrentUser() user: AuthUser, @Param('batchId', Uuid) batchId: string, @Res() res: Response) {
    const file = await this.imports.errorsWorkbook(user, batchId);
    res.setHeader('Content-Type', XLSX_MIME);
    res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
    res.send(file.buffer);
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthUser, @Param('id', Uuid) id: string) {
    return this.users.detail(user, id);
  }

  @Post()
  @Roles(...ACCOUNT_MANAGERS)
  create(@CurrentUser() user: AuthUser, @Body(zod(createUserSchema)) body: z.output<typeof createUserSchema>) {
    return this.users.create(user, body);
  }

  @Patch(':id')
  @Roles(...ACCOUNT_MANAGERS)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', Uuid) id: string,
    @Body(zod(updateUserSchema)) body: z.output<typeof updateUserSchema>,
  ) {
    return this.users.update(user, id, body);
  }

  @Put(':id/roles')
  @Roles(...ACCOUNT_MANAGERS)
  setRoles(
    @CurrentUser() user: AuthUser,
    @Param('id', Uuid) id: string,
    @Body(zod(setRolesSchema)) body: z.output<typeof setRolesSchema>,
  ) {
    return this.users.setRoles(user, id, body.roles);
  }

  @Post(':id/status')
  @Roles(...ACCOUNT_MANAGERS)
  @HttpCode(200)
  setStatus(
    @CurrentUser() user: AuthUser,
    @Param('id', Uuid) id: string,
    @Body(zod(setUserStatusSchema)) body: z.output<typeof setUserStatusSchema>,
  ) {
    return this.users.setStatus(user, id, body.status, body.reason);
  }

  @Post(':id/reset-password')
  @Roles(...ACCOUNT_MANAGERS)
  @HttpCode(200)
  resetPassword(@CurrentUser() user: AuthUser, @Param('id', Uuid) id: string) {
    return this.users.resetPassword(user, id);
  }

  @Post(':id/unlock')
  @Roles(...ACCOUNT_MANAGERS)
  @HttpCode(200)
  unlock(@CurrentUser() user: AuthUser, @Param('id', Uuid) id: string) {
    return this.users.unlock(user, id);
  }

  @Post(':id/revoke-sessions')
  @Roles(...ACCOUNT_MANAGERS)
  @HttpCode(200)
  revokeSessions(@CurrentUser() user: AuthUser, @Param('id', Uuid) id: string) {
    return this.users.revokeSessions(user, id);
  }

  @Delete(':id')
  @Roles(...ACCOUNT_MANAGERS)
  remove(@CurrentUser() user: AuthUser, @Param('id', Uuid) id: string) {
    return this.users.remove(user, id);
  }

  /** Nomaqbul profil rasmini olib tashlash (o‘z rasmi — `DELETE /me/avatar`). */
  @Delete(':id/avatar')
  @Roles(...ACCOUNT_MANAGERS)
  removeAvatar(@CurrentUser() user: AuthUser, @Param('id', Uuid) id: string) {
    return this.users.removeAvatar(user, id);
  }
}
