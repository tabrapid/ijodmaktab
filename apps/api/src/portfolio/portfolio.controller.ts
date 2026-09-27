import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query, Res } from '@nestjs/common';
import {
  portfolioBatchReviewSchema,
  portfolioEvidenceExportQuerySchema,
  portfolioExportSchema,
  portfolioItemSchema,
  portfolioListQuerySchema,
  portfolioReviewQueueQuerySchema,
  portfolioReviewSchema,
  portfolioStudentsQuerySchema,
} from '@ijod/shared';
import type { Response } from 'express';
import type { z } from 'zod';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, Roles } from '../common/decorators.js';
import { Uuid } from '../common/uuid.pipe.js';
import { XLSX_MIME } from '../common/xlsx.js';
import { zod } from '../common/zod.pipe.js';
import { PortfolioExportService } from './portfolio-export.service.js';
import { PortfolioStudentsService } from './portfolio-students.service.js';
import { PortfolioService } from './portfolio.service.js';

type Out<T extends z.ZodType> = z.output<T>;

@Controller('portfolio')
@Roles('STUDENT', 'TEACHER', 'DEPUTY', 'SUPER_ADMIN')
export class PortfolioController {
  constructor(
    private readonly portfolio: PortfolioService,
    private readonly students: PortfolioStudentsService,
    private readonly exports: PortfolioExportService,
  ) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query(zod(portfolioListQuerySchema)) query: Out<typeof portfolioListQuerySchema>,
  ) {
    return this.portfolio.list(user, query);
  }

  @Get('review-queue')
  @Roles('TEACHER', 'DEPUTY', 'SUPER_ADMIN')
  reviewQueue(
    @CurrentUser() user: AuthUser,
    @Query(zod(portfolioReviewQueueQuerySchema)) query: Out<typeof portfolioReviewQueueQuerySchema>,
  ) {
    return this.portfolio.reviewQueue(user, query.ownerId);
  }

  /** Tekshiruv navbati o‘quvchilar bo‘yicha guruhlangan. */
  @Get('review-queue/students')
  @Roles('TEACHER', 'DEPUTY', 'SUPER_ADMIN')
  reviewQueueByOwner(@CurrentUser() user: AuthUser) {
    return this.portfolio.reviewQueueByOwner(user);
  }

  @Post('review-batch')
  @Roles('TEACHER', 'DEPUTY', 'SUPER_ADMIN')
  @HttpCode(200)
  reviewBatch(
    @CurrentUser() user: AuthUser,
    @Body(zod(portfolioBatchReviewSchema)) body: Out<typeof portfolioBatchReviewSchema>,
  ) {
    return this.portfolio.reviewBatch(user, body);
  }

  @Get('school')
  @Roles('DEPUTY', 'SUPER_ADMIN')
  school(
    @CurrentUser() user: AuthUser,
    @Query(zod(portfolioListQuerySchema)) query: Out<typeof portfolioListQuerySchema>,
  ) {
    return this.portfolio.schoolList(user, query);
  }

  /** O‘quvchilar katalogi: rahbariyat — butun maktab, sinf rahbari — o‘z sinflari. */
  @Get('students')
  @Roles('TEACHER', 'DEPUTY', 'SUPER_ADMIN')
  studentsDirectory(
    @CurrentUser() user: AuthUser,
    @Query(zod(portfolioStudentsQuerySchema)) query: Out<typeof portfolioStudentsQuerySchema>,
  ) {
    return this.students.directory(user, query);
  }

  @Get('students.xlsx')
  @Roles('TEACHER', 'DEPUTY', 'SUPER_ADMIN')
  async studentsWorkbook(
    @CurrentUser() user: AuthUser,
    @Query(zod(portfolioStudentsQuerySchema)) query: Out<typeof portfolioStudentsQuerySchema>,
    @Res() res: Response,
  ) {
    const file = await this.students.directoryWorkbook(user, query);
    res.setHeader('Content-Type', XLSX_MIME);
    res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(file.buffer);
  }

  /** Bitta o‘quvchining jamlangan portfoliosi. */
  @Get('students/:ownerId')
  student(@CurrentUser() user: AuthUser, @Param('ownerId', Uuid) ownerId: string) {
    return this.students.consolidated(user, ownerId);
  }

  /** Sertifikat va dalil fayllari ZIP arxivda (ro‘yxat Excel fayli bilan). */
  @Get('students/:ownerId/evidence.zip')
  evidenceZip(
    @CurrentUser() user: AuthUser,
    @Param('ownerId', Uuid) ownerId: string,
    @Query(zod(portfolioEvidenceExportQuerySchema)) query: Out<typeof portfolioEvidenceExportQuerySchema>,
    @Res() res: Response,
  ) {
    return this.exports.evidenceZip(user, ownerId, query, res);
  }

  @Post('print/:ownerId')
  @HttpCode(200)
  printable(
    @CurrentUser() user: AuthUser,
    @Param('ownerId', Uuid) ownerId: string,
    @Body(zod(portfolioExportSchema)) body: Out<typeof portfolioExportSchema>,
  ) {
    return this.portfolio.printable(user, ownerId, body.itemIds);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', Uuid) id: string) {
    return this.portfolio.get(user, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body(zod(portfolioItemSchema)) body: Out<typeof portfolioItemSchema>) {
    return this.portfolio.create(user, body);
  }

  @Put(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', Uuid) id: string,
    @Body(zod(portfolioItemSchema)) body: Out<typeof portfolioItemSchema>,
  ) {
    return this.portfolio.update(user, id, body);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id', Uuid) id: string) {
    return this.portfolio.remove(user, id);
  }

  @Post(':id/submit')
  @HttpCode(200)
  submit(@CurrentUser() user: AuthUser, @Param('id', Uuid) id: string) {
    return this.portfolio.submit(user, id);
  }

  @Post(':id/review')
  @Roles('TEACHER', 'DEPUTY', 'SUPER_ADMIN')
  @HttpCode(200)
  review(
    @CurrentUser() user: AuthUser,
    @Param('id', Uuid) id: string,
    @Body(zod(portfolioReviewSchema)) body: Out<typeof portfolioReviewSchema>,
  ) {
    return this.portfolio.review(user, id, body);
  }
}
