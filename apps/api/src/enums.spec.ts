import * as shared from '@ijod/shared';
import * as prisma from './generated/prisma/enums.js';

/** Umumiy paketdagi ro‘yxatlar Prisma sxemasidagi enumlar bilan bir xil bo‘lishi shart. */
const pairs: [string, readonly string[], Record<string, string>][] = [
  ['Role', shared.ROLES, prisma.Role],
  ['UserStatus', shared.USER_STATUSES, prisma.UserStatus],
  ['Category', shared.CATEGORIES, prisma.Category],
  ['Difficulty', shared.DIFFICULTIES, prisma.Difficulty],
  ['QuestionType', shared.QUESTION_TYPES, prisma.QuestionType],
  ['QuestionVisibility', shared.QUESTION_VISIBILITIES, prisma.QuestionVisibility],
  ['TestStatus', shared.TEST_STATUSES, prisma.TestStatus],
  ['TestVersionStatus', shared.TEST_VERSION_STATUSES, prisma.TestVersionStatus],
  ['SharePermission', shared.SHARE_PERMISSIONS, prisma.SharePermission],
  ['AttemptPolicy', shared.ATTEMPT_POLICIES, prisma.AttemptPolicy],
  ['ScoreVisibility', shared.SCORE_VISIBILITIES, prisma.ScoreVisibility],
  ['ReviewVisibility', shared.REVIEW_VISIBILITIES, prisma.ReviewVisibility],
  ['AttemptStatus', shared.ATTEMPT_STATUSES, prisma.AttemptStatus],
  ['SubmitSource', shared.SUBMIT_SOURCES, prisma.SubmitSource],
  ['PortfolioItemType', shared.PORTFOLIO_ITEM_TYPES, prisma.PortfolioItemType],
  ['AchievementLevel', shared.ACHIEVEMENT_LEVELS, prisma.AchievementLevel],
  ['PortfolioStatus', shared.PORTFOLIO_STATUSES, prisma.PortfolioStatus],
  ['PortfolioVisibility', shared.PORTFOLIO_VISIBILITIES, prisma.PortfolioVisibility],
  ['ExportKind', shared.EXPORT_KINDS, prisma.ExportKind],
  ['ExportStatus', shared.EXPORT_STATUSES, prisma.ExportStatus],
];

describe('enumlar mosligi', () => {
  it.each(pairs)('%s', (_name, sharedValues, prismaEnum) => {
    expect([...sharedValues].sort()).toEqual(Object.values(prismaEnum).sort());
  });
});
