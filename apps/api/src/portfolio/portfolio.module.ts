import { Module } from '@nestjs/common';
import { FilesController } from '../files/files.controller.js';
import { FilesService } from '../files/files.service.js';
import { PortfolioAccess } from './portfolio-access.js';
import { PortfolioExportService } from './portfolio-export.service.js';
import { PortfolioStudentsService } from './portfolio-students.service.js';
import { PortfolioController } from './portfolio.controller.js';
import { PortfolioService } from './portfolio.service.js';

/** Portfolio va yopiq fayl ombori. */
@Module({
  controllers: [PortfolioController, FilesController],
  providers: [PortfolioAccess, PortfolioService, PortfolioStudentsService, PortfolioExportService, FilesService],
})
export class PortfolioModule {}
