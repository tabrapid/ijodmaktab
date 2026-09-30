import { Module } from '@nestjs/common';
import { MentorshipService } from './mentorship.service.js';
import { TeacherProfileController, TeacherReferenceController } from './teacher-profile.controller.js';
import { TeacherProfileService } from './teacher-profile.service.js';

/** O‘qituvchi ma’lumotnomasi (1–11-bandlar) va o‘quvchilar sertifikatlariga ustozlik. */
@Module({
  controllers: [TeacherProfileController, TeacherReferenceController],
  providers: [TeacherProfileService, MentorshipService],
})
export class TeacherProfileModule {}
