import {
  CATEGORY_LABELS,
  DIFFICULTY_LABELS,
  PARTICIPATION_STATUS_LABELS,
  PORTFOLIO_STATUS_LABELS,
  ROLE_LABELS,
  SESSION_STATE_LABELS,
  TEST_STATUS_LABELS,
  USER_STATUS_LABELS,
  type Category,
  type Difficulty,
  type ParticipationStatus,
  type PortfolioStatus,
  type Role,
  type SessionState,
  type TestStatus,
  type UserStatus,
} from '@ijod/shared';
import { Badge, type BadgeTone } from './ui/badge';

/** Holatlar rang bilan birga matn bilan ham ko‘rsatiladi (rangsiz ham tushunarli). */

const SESSION_TONES: Record<SessionState, BadgeTone> = {
  SCHEDULED: 'blue',
  OPEN: 'green',
  CLOSED: 'gray',
  CANCELLED: 'red',
};

export const SessionStateBadge = ({ state }: { state: SessionState }) => (
  <Badge tone={SESSION_TONES[state]}>{SESSION_STATE_LABELS[state]}</Badge>
);

const PARTICIPATION_TONES: Record<ParticipationStatus, BadgeTone> = {
  NOT_STARTED: 'gray',
  IN_PROGRESS: 'blue',
  SUBMITTED: 'green',
  EXPIRED: 'amber',
  UNDER_REVIEW: 'violet',
  CANCELLED: 'red',
};

export const ParticipationBadge = ({ status }: { status: ParticipationStatus }) => (
  <Badge tone={PARTICIPATION_TONES[status]}>{PARTICIPATION_STATUS_LABELS[status]}</Badge>
);

const PORTFOLIO_TONES: Record<PortfolioStatus, BadgeTone> = {
  DRAFT: 'gray',
  SUBMITTED: 'blue',
  APPROVED: 'green',
  RETURNED: 'amber',
};

export const PortfolioStatusBadge = ({ status }: { status: PortfolioStatus }) => (
  <Badge tone={PORTFOLIO_TONES[status]}>{PORTFOLIO_STATUS_LABELS[status]}</Badge>
);

const USER_TONES: Record<UserStatus, BadgeTone> = { ACTIVE: 'green', DEACTIVATED: 'amber', ARCHIVED: 'gray' };

export const UserStatusBadge = ({ status }: { status: UserStatus }) => (
  <Badge tone={USER_TONES[status]}>{USER_STATUS_LABELS[status]}</Badge>
);

const TEST_TONES: Record<TestStatus, BadgeTone> = { DRAFT: 'gray', ACTIVE: 'green', ARCHIVED: 'amber' };

export const TestStatusBadge = ({ status }: { status: TestStatus }) => (
  <Badge tone={TEST_TONES[status]}>{TEST_STATUS_LABELS[status]}</Badge>
);

export const RoleBadges = ({ roles }: { roles: Role[] }) => (
  <span className="inline-flex flex-wrap gap-1">
    {roles.map((role) => (
      <Badge key={role} tone={role === 'STUDENT' ? 'gray' : role === 'TEACHER' ? 'brand' : 'violet'}>
        {ROLE_LABELS[role]}
      </Badge>
    ))}
  </span>
);

const CATEGORY_TONES: Record<Category, BadgeTone> = { KNOWLEDGE: 'blue', APPLICATION: 'violet', REASONING: 'amber' };

export const CategoryBadge = ({ category }: { category: Category }) => (
  <Badge tone={CATEGORY_TONES[category]}>{CATEGORY_LABELS[category]}</Badge>
);

const DIFFICULTY_TONES: Record<Difficulty, BadgeTone> = { EASY: 'green', MEDIUM: 'gray', HARD: 'red' };

export const DifficultyBadge = ({ difficulty }: { difficulty: Difficulty }) => (
  <Badge tone={DIFFICULTY_TONES[difficulty]}>{DIFFICULTY_LABELS[difficulty]}</Badge>
);
