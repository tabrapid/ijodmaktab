import { Module } from '@nestjs/common';
import { StructureController } from './structure.controller.js';
import { StructureService } from './structure.service.js';

@Module({
  controllers: [StructureController],
  providers: [StructureService],
  exports: [StructureService],
})
export class StructureModule {}
