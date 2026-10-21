import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PASSWORD_CHANGE_REQUIRED } from '@cdls/shared';
import type { Request } from 'express';
import type { AuthedRequest } from '../common/auth-user.js';
import { ALLOW_DURING_PASSWORD_CHANGE, IS_PUBLIC } from '../common/decorators.js';
import { AuthService } from './auth.service.js';

/**
 * Global guard: every route needs `Authorization: Bearer <access token>` unless marked @Public().
 * A user who must still choose a password only reaches routes marked @AllowDuringPasswordChange().
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;
    const request = context.switchToHttp().getRequest<Request & AuthedRequest>();
    const [scheme, token] = (request.headers.authorization ?? '').split(' ');
    const user = scheme === 'Bearer' && token ? await this.auth.userFromAccessToken(token) : null;
    if (!user) throw new UnauthorizedException('Connexion requise.');
    if (
      user.mustChangePassword &&
      !this.reflector.getAllAndOverride<boolean>(ALLOW_DURING_PASSWORD_CHANGE, targets)
    ) {
      throw new ForbiddenException({
        statusCode: 403,
        message: 'Choisissez votre mot de passe avant de continuer.',
        error: PASSWORD_CHANGE_REQUIRED,
      });
    }
    request.user = user;
    return true;
  }
}
