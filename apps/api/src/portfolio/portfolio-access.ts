import { Injectable } from '@nestjs/common';
import { AccessService } from '../access/access.service.js';
import type { AuthUser } from '../common/auth-user.js';
import { hasRole, isLeadership, isStaff } from '../common/auth-user.js';
import { ownerFacts, type ItemWithRelations, type OwnerFacts } from './portfolio-common.js';

/**
 * So‘rov egasining portfolio bo‘yicha vakolatlari. Sinflar ro‘yxati bir marta o‘qiladi, keyingi
 * tekshiruvlar (ro‘yxatdagi har bir yozuv uchun) bazaga qayta murojaat qilmaydi.
 */
export interface PortfolioScope {
  viewer: AuthUser;
  leadership: boolean;
  teacher: boolean;
  staff: boolean;
  seesAllStudents: boolean;
  /** Sinf rahbari bo‘lgan sinflar (joriy o‘quv yili). */
  homeroom: ReadonlySet<string>;
  /** Dars beradigan yoki sinf rahbari bo‘lgan sinflar. */
  teaching: ReadonlySet<string>;
}

@Injectable()
export class PortfolioAccess {
  constructor(private readonly access: AccessService) {}

  async scope(viewer: AuthUser): Promise<PortfolioScope> {
    const teacher = hasRole(viewer, 'TEACHER');
    const [homeroom, teaching] = teacher
      ? await Promise.all([this.access.homeroomClassIds(viewer.id), this.access.teacherClassIds(viewer.id)])
      : [[], []];
    return {
      viewer,
      leadership: isLeadership(viewer),
      teacher,
      staff: isStaff(viewer),
      seesAllStudents: this.access.seesAllStudents(viewer),
      homeroom: new Set(homeroom),
      teaching: new Set(teaching),
    };
  }

  /** O‘quvchi yozuvini sinf rahbari, har qanday yozuvni rahbariyat tasdiqlaydi. O‘zini o‘zi tasdiqlamaydi. */
  canReviewOwner(scope: PortfolioScope, owner: OwnerFacts) {
    if (owner.id === scope.viewer.id) return false;
    if (scope.leadership) return true;
    if (!owner.isStudent || !scope.teacher) return false;
    return Boolean(owner.classId && scope.homeroom.has(owner.classId));
  }

  canReview(scope: PortfolioScope, item: ItemWithRelations) {
    return this.canReviewOwner(scope, ownerFacts(item.owner));
  }

  /**
   * Tekshiruvchi bo‘lmagan xodim egasini ko‘ra oladimi: o‘quvchini — uni o‘qitadigan xodim va
   * rahbariyat; o‘qituvchini — maktab xodimlari.
   */
  canSeeOwnerAsStaff(scope: PortfolioScope, owner: OwnerFacts) {
    if (!scope.staff) return false;
    if (!owner.isStudent) return true;
    if (scope.seesAllStudents) return true;
    return scope.teacher && Boolean(owner.classId && scope.teaching.has(owner.classId));
  }

  /** Yozuvni ko‘rish: egasi; tekshiruvchi; boshqa xodim — faqat “maktab xodimlari” ko‘rinishidagi yozuv. */
  canView(scope: PortfolioScope, item: ItemWithRelations) {
    if (item.ownerId === scope.viewer.id) return true;
    if (this.canReview(scope, item)) return true;
    if (item.visibility !== 'STAFF') return false;
    return this.canSeeOwnerAsStaff(scope, ownerFacts(item.owner));
  }
}
