import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { API_PREFIX } from '../app.prefix.js';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, Public } from '../common/decorators.js';
import type { Env } from '../config/env.validation.js';
import { AuthService, type IssuedSession, toSessionUser } from './auth.service.js';
import { LoginDto, SessionDto, SessionUserDto } from './dto/auth.dto.js';

export const REFRESH_COOKIE = 'cdls_refresh';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly secureCookie: boolean;

  constructor(
    private readonly auth: AuthService,
    config: ConfigService<Env, true>,
  ) {
    this.secureCookie = config.get('NODE_ENV', { infer: true }) === 'production';
  }

  /** Signs in; sets the refresh token as an httpOnly cookie. Limited to 5 attempts a minute. */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  @ApiOkResponse({ type: SessionDto })
  @ApiUnauthorizedResponse({ description: 'Wrong e-mail or password, or inactive account.' })
  async login(
    @Body() body: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionDto> {
    return this.send(res, await this.auth.login(body.email, body.password, req.get('user-agent')));
  }

  /** New access token from the refresh cookie; the cookie is rotated. */
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(200)
  @ApiCookieAuth(REFRESH_COOKIE)
  @ApiOkResponse({ type: SessionDto })
  @ApiUnauthorizedResponse({ description: 'Missing, expired, revoked or reused refresh token.' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionDto> {
    try {
      return this.send(res, await this.auth.refresh(cookie(req), req.get('user-agent')));
    } catch (error) {
      this.clear(res);
      throw error;
    }
  }

  /** Ends this session (the refresh token family) and clears the cookie. */
  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout(cookie(req));
    this.clear(res);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOkResponse({ type: SessionUserDto })
  me(@CurrentUser() user: AuthUser): SessionUserDto {
    return toSessionUser(user);
  }

  private send(res: Response, issued: IssuedSession): SessionDto {
    res.cookie(REFRESH_COOKIE, issued.refreshToken, {
      httpOnly: true,
      secure: this.secureCookie,
      sameSite: 'strict',
      path: `/${API_PREFIX}/auth`,
      maxAge: issued.refreshMaxAgeMs,
    });
    return issued.session;
  }

  private clear(res: Response): void {
    res.clearCookie(REFRESH_COOKIE, {
      httpOnly: true,
      secure: this.secureCookie,
      sameSite: 'strict',
      path: `/${API_PREFIX}/auth`,
    });
  }
}

function cookie(req: Request): string | undefined {
  const cookies = req.cookies as Record<string, string | undefined> | undefined;
  return cookies?.[REFRESH_COOKIE];
}
