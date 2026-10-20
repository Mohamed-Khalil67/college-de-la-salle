import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { AuthedRequest } from '../common/auth-user.js';
import { IS_PUBLIC } from '../common/decorators.js';
import { AuthService } from './auth.service.js';

/** Global guard: every route needs `Authorization: Bearer <access token>` unless marked @Public(). */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      return true;
    }
    const request = context.switchToHttp().getRequest<Request & AuthedRequest>();
    const [scheme, token] = (request.headers.authorization ?? '').split(' ');
    const user = scheme === 'Bearer' && token ? await this.auth.userFromAccessToken(token) : null;
    if (!user) throw new UnauthorizedException('Connexion requise.');
    request.user = user;
    return true;
  }
}
