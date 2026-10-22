import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { hasGrant } from '../access/grants.js';
import type { AuthedRequest } from './auth-user.js';
import { type Grant, IS_PUBLIC, ROLES } from './decorators.js';

/**
 * Enforces @Roles() (and @StructureEditors()); runs after JwtAuthGuard. Routes without @Roles() are open to
 * every signed-in user.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;
    const grants = this.reflector.getAllAndOverride<Grant[] | undefined>(ROLES, targets);
    if (!grants?.length) return true;
    const user = context.switchToHttp().getRequest<AuthedRequest>().user;
    if (user && grants.some((g) => hasGrant(user, g))) return true;
    throw new ForbiddenException('Action non autorisée.');
  }
}
