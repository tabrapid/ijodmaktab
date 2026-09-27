import { Controller, Get, Param, Post, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser } from '../common/decorators.js';
import type { UploadedFileData } from '../common/uploaded-file.js';
import { Uuid } from '../common/uuid.pipe.js';
import { FILE_MAX_BYTES, FilesService } from './files.service.js';

@Controller('files')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: FILE_MAX_BYTES, files: 1 } }))
  upload(@CurrentUser() user: AuthUser, @UploadedFile() file?: UploadedFileData) {
    return this.files.upload(user, file);
  }

  @Get(':id')
  download(@CurrentUser() user: AuthUser, @Param('id', Uuid) id: string, @Res() res: Response) {
    return this.files.download(user, id, res);
  }
}
