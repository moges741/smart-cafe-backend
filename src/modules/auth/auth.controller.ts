import {
  Controller, Post, Body, HttpCode,
  HttpStatus, Res, Req, UnauthorizedException
} from '@nestjs/common';
import type { Response, Request } from 'express';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

// How long each cookie lives in the browser
const ACCESS_TOKEN_TTL  = 60 * 60 * 1000;          // 1 hour in ms
const REFRESH_TOKEN_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days in ms

// Reusable cookie config — same options applied to both cookies
const cookieOptions = (maxAge: number) => ({
  httpOnly: true,    // JavaScript cannot read this cookie at all
  secure: process.env.NODE_ENV === 'production', // HTTPS only in prod, HTTP allowed in dev
  sameSite: 'strict' as const, // browser won't send cookie on cross-site requests (CSRF protection)
  maxAge,            // when the cookie expires
  path: '/',
});

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  register(@Body() dto: RegisterDto) {
    // Registration doesn't log you in automatically
    // Just creates the account and returns basic user info (no tokens)
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login — sets HttpOnly cookie tokens' })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
    // passthrough: true means NestJS still handles sending the response
    // without it you'd have to call res.json() manually
  ) {
    const { accessToken, refreshToken } = await this.authService.login(dto);

    // Set tokens as HttpOnly cookies — the frontend never sees these values
    res.cookie('access_token', accessToken, cookieOptions(ACCESS_TOKEN_TTL));
    res.cookie('refresh_token', refreshToken, cookieOptions(REFRESH_TOKEN_TTL));

    // Return minimal info the frontend needs to know (who logged in, what role)
    // but NOT the token values themselves
    return { message: 'Login successful' };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token using cookie' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Read the refresh token from the cookie, not the request body
    const token = req.cookies?.refresh_token;

    if (!token) {
      throw new UnauthorizedException('No refresh token found');
    }

    const { accessToken, refreshToken } = await this.authService.refreshTokens(token);

    // Rotate both cookies — new access token + new refresh token
    res.cookie('access_token', accessToken, cookieOptions(ACCESS_TOKEN_TTL));
    res.cookie('refresh_token', refreshToken, cookieOptions(REFRESH_TOKEN_TTL));

    return { message: 'Tokens refreshed' };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout — clears cookies' })
  logout(@Res({ passthrough: true }) res: Response) {
    // Clearing cookies is just setting them with maxAge 0
    res.clearCookie('access_token');
    res.clearCookie('refresh_token');
    return { message: 'Logged out successfully' };
  }
}