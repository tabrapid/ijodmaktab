import { Module } from '@nestjs/common';
import { AttemptsController } from './attempts/attempts.controller.js';
import { AttemptsService } from './attempts/attempts.service.js';
import { ExportsService } from './exports/exports.service.js';
import { GradingService } from './grading/grading.service.js';
import { JobsService } from './jobs/jobs.service.js';
import { QuestionsModule } from './questions/questions.module.js';
import { ResultsController } from './results/results.controller.js';
import { ResultsService } from './results/results.service.js';
import { SessionsController } from './sessions/sessions.controller.js';
import { SessionsService } from './sessions/sessions.service.js';
import { TestsModule } from './tests/tests.module.js';

/** Onlayn nazorat ishlari: sessiyalar, urinishlar, baholash, natijalar va eksport. */
@Module({
  imports: [QuestionsModule, TestsModule],
  controllers: [SessionsController, AttemptsController, ResultsController],
  providers: [SessionsService, AttemptsService, GradingService, ResultsService, ExportsService, JobsService],
  exports: [GradingService, ResultsService, SessionsService, AttemptsService, JobsService],
})
export class AssessmentModule {}
