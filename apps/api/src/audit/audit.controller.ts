import { Controller, Get, Query } from '@nestjs/common';
import { auditListQuerySchema } from '@ijod/shared';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, Roles } from '../common/decorators.js';
import { zod } from '../common/zod.pipe.js';
import { AuditService } from './audit.service.js';

@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @Roles('DEPUTY', 'ADMIN', 'SUPER_ADMIN')
  list(
    @CurrentUser() user: AuthUser,
    @Query(zod(auditListQuerySchema)) query: ReturnType<typeof auditListQuerySchema.parse>,
  ) {
    return this.audit.list(user, query);
  }
}
