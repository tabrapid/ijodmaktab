import { Module } from '@nestjs/common';
import { ManagementClassesService } from './management-classes.service.js';
import { ManagementStudentsController } from './management-students.controller.js';
import { ManagementStudentsService } from './management-students.service.js';

/** Rahbariyatning “O‘quvchilar” bo‘limi: o‘quvchilar, sinflar va sinf rahbarlari, o‘quvchi profili. */
@Module({
  controllers: [ManagementStudentsController],
  providers: [ManagementStudentsService, ManagementClassesService],
})
export class StudentsModule {}
