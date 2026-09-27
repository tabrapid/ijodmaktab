import { Module } from '@nestjs/common';
import { QuestionsModule } from '../questions/questions.module.js';
import { TestsController } from './tests.controller.js';
import { TestsService } from './tests.service.js';

@Module({
  imports: [QuestionsModule],
  controllers: [TestsController],
  providers: [TestsService],
  exports: [TestsService],
})
export class TestsModule {}
