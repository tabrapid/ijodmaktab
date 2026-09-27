import { Body, Controller, Get, HttpCode, Param, Post, Query, Res } from '@nestjs/common';
import { createExportSchema, csvList, PARTICIPATION_STATUSES } from '@ijod/shared';
import type { Response } from 'express';
import { z } from 'zod';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, Roles } from '../common/decorators.js';
import { Uuid } from '../common/uuid.pipe.js';
import { zod } from '../common/zod.pipe.js';
import { ExportsService } from '../exports/exports.service.js';
import { ResultsService } from './results.service.js';

/** So‘rov satridagi filtrlar: ?statuses=SUBMITTED,EXPIRED&classIds=...&minPercent=50 */
const resultsQuerySchema = z.object({
  statuses: csvList(z.enum(PARTICIPATION_STATUSES)).optional(),
  classIds: csvList(z.uuid()).optional(),
  minPercent: z.coerce.number().min(0).max(100).optional(),
  maxPercent: z.coerce.number().min(0).max(100).optional(),
  q: z.string().trim().max(100).optional(),
});

@Controller()
@Roles('TEACHER', 'DEPUTY', 'SUPER_ADMIN')
export class ResultsController {
  constructor(
    private readonly results: ResultsService,
    private readonly exports: ExportsService,
  ) {}

  @Get('sessions/:id/results')
  sessionResults(
    @CurrentUser() user: AuthUser,
    @Param('id', Uuid) id: string,
    @Query(zod(resultsQuerySchema)) query: z.output<typeof resultsQuerySchema>,
  ) {
    return this.results.sessionResults(user, id, query);
  }

  @Post('exports/preview')
  @HttpCode(200)
  previewExport(@CurrentUser() user: AuthUser, @Body(zod(createExportSchema)) body: z.output<typeof createExportSchema>) {
    return this.exports.previewCount(user, body);
  }

  @Post('exports')
  createExport(@CurrentUser() user: AuthUser, @Body(zod(createExportSchema)) body: z.output<typeof createExportSchema>) {
    return this.exports.create(user, body);
  }

  @Get('exports')
  listExports(@CurrentUser() user: AuthUser) {
    return this.exports.list(user);
  }

  @Get('exports/:id')
  getExport(@CurrentUser() user: AuthUser, @Param('id', Uuid) id: string) {
    return this.exports.get(user, id);
  }

  @Get('exports/:id/download')
  download(@CurrentUser() user: AuthUser, @Param('id', Uuid) id: string, @Res() res: Response) {
    return this.exports.download(user, id, res);
  }
}
