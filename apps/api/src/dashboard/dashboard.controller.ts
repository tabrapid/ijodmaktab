import { Controller, Get } from '@nestjs/common';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, Roles } from '../common/decorators.js';
import { DashboardService } from './dashboard.service.js';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('teacher')
  @Roles('TEACHER', 'DEPUTY')
  teacher(@CurrentUser() user: AuthUser) {
    return this.dashboard.teacher(user);
  }

  /** Rahbariyat: sinflar kesimidagi ko‘rsatkichlar, ishtirok, tasdiqlash navbati. */
  @Get('leadership')
  @Roles('DEPUTY', 'SUPER_ADMIN')
  leadership() {
    return this.dashboard.leadership();
  }

  /** Administrator: hisoblar va maktab tuzilmasi holati (o‘quv natijalarisiz). */
  @Get('admin')
  @Roles('ADMIN', 'SUPER_ADMIN')
  admin() {
    return this.dashboard.admin();
  }

  @Get('system')
  @Roles('SUPER_ADMIN')
  system(@CurrentUser() user: AuthUser) {
    return this.dashboard.system(user);
  }
}
