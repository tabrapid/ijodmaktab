import { Injectable } from '@nestjs/common';
import type { AuthUser } from '../common/auth-user.js';
import { hasRole } from '../common/auth-user.js';
import { badRequest } from '../common/errors.js';
import { PrismaService } from '../prisma/prisma.service.js';

export interface SessionOwnership {
  id: string;
  createdById: string;
  conductorId: string;
}

/**
 * Resurs darajasidagi ruxsatlar (reja, 2-bo‘lim). Rol tekshiruvi global guardda,
 * bu yerda esa “aynan shu sinf / shu o‘quvchi / shu sessiya” darajasidagi qoidalar.
 * Barcha tekshiruvlar serverda bajariladi — filtrni o‘zgartirish ularni chetlab o‘tmaydi.
 */
@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  currentYear() {
    return this.prisma.academicYear.findFirst({ where: { isCurrent: true } });
  }

  async requireCurrentYear() {
    const year = await this.currentYear();
    if (!year) {
      throw badRequest('NO_CURRENT_YEAR', 'Joriy o‘quv yili belgilanmagan. Administratorga murojaat qiling.');
    }
    return year;
  }

  /** O‘qituvchi dars beradigan yoki sinf rahbari bo‘lgan sinflar (joriy o‘quv yili). */
  async teacherClassIds(teacherId: string): Promise<string[]> {
    const [teaching, homeroom] = await Promise.all([
      this.prisma.teachingAssignment.findMany({
        where: { teacherId, academicYear: { isCurrent: true } },
        select: { classId: true },
      }),
      this.prisma.class.findMany({
        where: { homeroomTeacherId: teacherId, academicYear: { isCurrent: true } },
        select: { id: true },
      }),
    ]);
    return [...new Set([...teaching.map((item) => item.classId), ...homeroom.map((item) => item.id)])];
  }

  /** Sinf rahbari bo‘lgan sinflar (joriy o‘quv yili). */
  async homeroomClassIds(teacherId: string): Promise<string[]> {
    const classes = await this.prisma.class.findMany({
      where: { homeroomTeacherId: teacherId, academicYear: { isCurrent: true } },
      select: { id: true },
    });
    return classes.map((item) => item.id);
  }

  /** Butun maktab o‘quvchilarini ko‘ra oladiganlar. */
  seesAllStudents(viewer: AuthUser) {
    return hasRole(viewer, 'DEPUTY', 'ADMIN', 'SUPER_ADMIN');
  }

  /**
   * O‘quvchini ko‘rish: o‘zi; rahbariyat va administrator; o‘qituvchi — faqat biriktirilgan
   * sinflardagi o‘quvchilar.
   */
  async canViewStudent(viewer: AuthUser, studentId: string): Promise<boolean> {
    if (viewer.id === studentId) return true;
    if (this.seesAllStudents(viewer)) return true;
    if (!hasRole(viewer, 'TEACHER')) return false;
    const classIds = await this.teacherClassIds(viewer.id);
    if (classIds.length === 0) return false;
    const count = await this.prisma.enrollment.count({
      where: { studentId, classId: { in: classIds }, endsOn: null },
    });
    return count > 0;
  }

  async canViewClass(viewer: AuthUser, classId: string): Promise<boolean> {
    if (this.seesAllStudents(viewer)) return true;
    if (!hasRole(viewer, 'TEACHER')) return false;
    return (await this.teacherClassIds(viewer.id)).includes(classId);
  }

  /** O‘qituvchi shu fan bo‘yicha shu sinfga test o‘tkaza oladimi (rahbariyat — istalgan sinfga). */
  async canTeach(viewer: AuthUser, subjectId: string, classId: string): Promise<boolean> {
    if (hasRole(viewer, 'DEPUTY', 'SUPER_ADMIN')) return true;
    if (!hasRole(viewer, 'TEACHER')) return false;
    const count = await this.prisma.teachingAssignment.count({
      where: { teacherId: viewer.id, subjectId, classId },
    });
    return count > 0;
  }

  /** Sessiyani boshqarish: yaratuvchi, o‘tkazuvchi yoki rahbariyat. */
  canManageSession(viewer: AuthUser, session: SessionOwnership): boolean {
    return (
      session.createdById === viewer.id ||
      session.conductorId === viewer.id ||
      hasRole(viewer, 'DEPUTY', 'SUPER_ADMIN')
    );
  }

  /**
   * Sessiya natijalarini ko‘rish: boshqaruvchilar va shu sessiyadagi sinflarning rahbarlari.
   * Administrator odatiy holatda o‘quv natijalarini ko‘rmaydi.
   */
  async canViewSessionResults(viewer: AuthUser, session: SessionOwnership): Promise<boolean> {
    if (this.canManageSession(viewer, session)) return true;
    if (!hasRole(viewer, 'TEACHER')) return false;
    const homeroom = await this.homeroomClassIds(viewer.id);
    if (homeroom.length === 0) return false;
    const count = await this.prisma.sessionAssignment.count({
      where: { sessionId: session.id, classId: { in: homeroom } },
    });
    return count > 0;
  }
}
