import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@cdls/shared';
import type { AuthedRequest } from './auth-user.js';
import { IS_PUBLIC, ROLES } from './decorators.js';

/** Enforces @Roles(); runs after JwtAuthGuard. Routes without @Roles() are open to every signed-in user. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES, targets);
    if (!roles?.length) return true;
    const user = context.switchToHttp().getRequest<AuthedRequest>().user;
    if (user && roles.includes(user.role)) return true;
    throw new ForbiddenException('Action non autorisée.');
  }
}
