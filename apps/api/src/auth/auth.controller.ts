import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiCookieAuth,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { API_PREFIX } from '../app.prefix.js';
import type { AuthUser } from '../common/auth-user.js';
import { AllowDuringPasswordChange, CurrentUser, Public } from '../common/decorators.js';
import { forgotPasswordTracker, loginTracker, passwordTracker } from '../common/client-key.js';
import type { Env } from '../config/env.validation.js';
import { AuthService, type IssuedSession, toSessionUser } from './auth.service.js';
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  ResetPasswordDto,
  SessionDto,
  SessionUserDto,
} from './dto/auth.dto.js';
import { PasswordResetService } from './password-reset.service.js';

export const REFRESH_COOKIE = 'cdls_refresh';

/** Read per request from the validated environment (defaults to 5). */
function loginLimit(): number {
  return Number(process.env['LOGIN_THROTTLE_LIMIT'] ?? 5) || 5;
}

/**
 * Per address and account, so a class behind one school address can sign in together; the address as a
 * whole stays capped by the `ip` limit (twelve times the account limit, at least 60 a minute).
 */
function ipCeiling(): number {
  return Math.max(loginLimit() * 12, 60);
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly secureCookie: boolean;

  constructor(
    private readonly auth: AuthService,
    private readonly passwordReset: PasswordResetService,
    config: ConfigService<Env, true>,
  ) {
    // ConfigService can hand back the raw environment string, and Docker passes an unset variable as ''.
    const override = String(config.get('COOKIE_SECURE', { infer: true }) ?? '').trim();
    this.secureCookie =
      override === '' ? config.get('NODE_ENV', { infer: true }) === 'production' : override === 'true';
  }

  /** Signs in; sets the refresh token as an httpOnly cookie. Limited to LOGIN_THROTTLE_LIMIT (5) attempts a minute per address and e-mail. */
  @Public()
  @Throttle({
    default: { limit: loginLimit, ttl: 60_000, getTracker: loginTracker },
    ip: { limit: ipCeiling, ttl: 60_000 },
  })
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
  // Every page load refreshes once: 30 a minute, or LOGIN_THROTTLE_LIMIT when that is raised for the browser e2e run.
  @Throttle({ default: { limit: () => Math.max(30, loginLimit()), ttl: 60_000 } })
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

  /**
   * Chooses a new password (current one required; at least 10 characters, not the e-mail). Signs out
   * every other session and returns a fresh one with a new refresh cookie. Limited like the login.
   */
  @AllowDuringPasswordChange()
  @Throttle({
    default: { limit: loginLimit, ttl: 60_000, getTracker: passwordTracker },
    ip: { limit: ipCeiling, ttl: 60_000 },
  })
  @Post('password')
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiOkResponse({ type: SessionDto })
  @ApiBadRequestResponse({ description: 'Wrong current password, or the new one breaks a rule.' })
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body() body: ChangePasswordDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionDto> {
    return this.send(
      res,
      await this.auth.changePassword(
        user.id,
        body.currentPassword,
        body.newPassword,
        req.get('user-agent'),
      ),
    );
  }

  /**
   * Mails a reset link to the account with this e-mail. Always 204: nothing says whether the account
   * exists or is active. Limited like the login, per address and e-mail.
   */
  @Public()
  @Throttle({
    default: { limit: loginLimit, ttl: 60_000, getTracker: forgotPasswordTracker },
    ip: { limit: ipCeiling, ttl: 60_000 },
  })
  @Post('forgot-password')
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'Accepted (whether or not an account matches).' })
  async forgotPassword(@Body() body: ForgotPasswordDto): Promise<void> {
    await this.passwordReset.request(body.identifier);
  }

  /**
   * Chooses a new password with the token of the e-mailed link (single use, short lived). Signs out
   * every session of the account; the user then signs in with the new password.
   */
  @Public()
  @Throttle({ default: { limit: loginLimit, ttl: 60_000 } })
  @Post('reset-password')
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'Password changed.' })
  @ApiBadRequestResponse({ description: 'Invalid, expired or used link, or a password that breaks a rule.' })
  async resetPassword(@Body() body: ResetPasswordDto): Promise<void> {
    await this.passwordReset.reset(body.token, body.newPassword);
  }

  @AllowDuringPasswordChange()
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
