import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

// @Roles('admin', 'manager') — used above route handlers
// Stores the roles in metadata that RolesGuard reads
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);