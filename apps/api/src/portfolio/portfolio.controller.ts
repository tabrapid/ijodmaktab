import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import {
  portfolioExportSchema,
  portfolioItemSchema,
  portfolioListQuerySchema,
  portfolioReviewSchema,
} from '@ijod/shared';
import type { z } from 'zod';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, Roles } from '../common/decorators.js';
import { Uuid } from '../common/uuid.pipe.js';
import { zod } from '../common/zod.pipe.js';
import { PortfolioService } from './portfolio.service.js';

type Out<T extends z.ZodType> = z.output<T>;

@Controller('portfolio')
@Roles('STUDENT', 'TEACHER', 'DEPUTY', 'SUPER_ADMIN')
export class PortfolioController {
  constructor(private readonly portfolio: PortfolioService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query(zod(portfolioListQuerySchema)) query: Out<typeof portfolioListQuerySchema>) {
    return this.portfolio.list(user, query);
  }

  @Get('review-queue')
  @Roles('TEACHER', 'DEPUTY', 'SUPER_ADMIN')
  reviewQueue(@CurrentUser() user: AuthUser) {
    return this.portfolio.reviewQueue(user);
  }

  @Get('school')
  @Roles('DEPUTY', 'SUPER_ADMIN')
  school(@CurrentUser() user: AuthUser, @Query(zod(portfolioListQuerySchema)) query: Out<typeof portfolioListQuerySchema>) {
    return this.portfolio.schoolList(user, query);
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
