import { Module } from '@nestjs/common';
import { FilesController } from '../files/files.controller.js';
import { FilesService } from '../files/files.service.js';
import { PortfolioController } from './portfolio.controller.js';
import { PortfolioService } from './portfolio.service.js';

/** Portfolio va yopiq fayl ombori. */
@Module({
  controllers: [PortfolioController, FilesController],
  providers: [PortfolioService, FilesService],
})
export class PortfolioModule {}
