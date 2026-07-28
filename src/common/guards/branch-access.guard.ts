import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';

/**
 * BranchAccessGuard
 * 
 * Ensures that staff members (kitchen, waiter, cashier, barista) can only
 * perform operational actions within their assigned branch.
 * 
 * Admin and manager roles bypass this check (they can access all branches).
 * Customers bypass this check (they don't have branch-restricted operations).
 * 
 * The guard reads `branchId` from query params, body, or route params.
 */
@Injectable()
export class BranchAccessGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) return true;

    const roleName = user.role?.name;

    // Admin and manager can access all branches
    if (['admin', 'manager'].includes(roleName)) return true;

    // Customers don't have branch-restricted operations
    if (roleName === 'customer') return true;

    // Staff roles: kitchen, waiter, cashier, barista
    const staffBranchId = user.employee?.branchId;
    if (!staffBranchId) {
      throw new ForbiddenException('You are not assigned to any branch. Contact your manager.');
    }

    // Extract branchId from query, body, or params
    const requestedBranchId =
      request.query?.branchId ||
      request.body?.branchId ||
      request.params?.branchId;

    // If no branchId is specified in the request, allow it
    // (the service layer should default to the user's branch)
    if (!requestedBranchId) return true;

    if (requestedBranchId !== staffBranchId) {
      throw new ForbiddenException(
        'You can only access data from your assigned branch.',
      );
    }

    return true;
  }
}
