import {
  Controller, Post, Body, HttpCode,
  HttpStatus, Res, Req, UseGuards,
  Get, Query, Delete, Patch, Param,
  UnauthorizedException
} from '@nestjs/common';
import { Response, Request } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { CreateStaffDto } from './dto/create-staff.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GoogleAuthGuard } from '../../common/guards/google-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
const ACCESS_TOKEN_TTL  = 60 * 60 * 1000;
const REFRESH_TOKEN_TTL = 30 * 24 * 60 * 60 * 1000;

const isProduction = process.env.NODE_ENV === 'production';

const cookieOptions = (maxAge: number) => ({
  httpOnly: true,
  secure: isProduction,
  sameSite: (isProduction ? 'none' : 'lax') as 'none' | 'lax',
  maxAge,
  path: '/',
});

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new customer account' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('verify-email')
  @ApiOperation({ summary: 'Verify email using token' })
  verifyEmail(@Body('token') token: string) {
    return this.authService.verifyEmail(token);
  }

  @Post('forgot-password')
  @ApiOperation({ summary: 'Request a password reset link' })
  forgotPassword(@Body('email') email: string) {
    return this.authService.forgotPassword(email);
  }

  @Post('reset-password')
  @ApiOperation({ summary: 'Reset password using token' })
  resetPassword(@Body() body: any) {
    return this.authService.resetPassword(body.token, body.password);
  }

  @Post('staff')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Admin creates a staff member with a specific role' })
  createStaff(@Body() dto: CreateStaffDto) {
    return this.authService.createStaff(dto);
  }

  @Delete('staff/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Admin deletes a staff member' })
  deleteStaff(@Param('id') id: string) {
    return this.authService.deleteStaff(id);
  }

  @Patch('staff/:id/toggle')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Admin toggles a staff member active status' })
  toggleStaffStatus(@Param('id') id: string) {
    return this.authService.toggleStaffStatus(id);
  }

  @Patch('staff/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Admin updates a staff member' })
  updateStaff(@Param('id') id: string, @Body() dto: any) {
    return this.authService.updateStaff(id, dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login — sets HttpOnly cookie tokens and returns auth payload' })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto);
    res.cookie('access_token', result.accessToken, cookieOptions(ACCESS_TOKEN_TTL));
    res.cookie('refresh_token', result.refreshToken, cookieOptions(REFRESH_TOKEN_TTL));
    return { 
      message: 'Login successful',
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: result.user,
    };
  }

  @Get('google')
  @UseGuards(GoogleAuthGuard)
  @ApiOperation({ summary: 'Redirect to Google OAuth consent screen' })
  googleAuth() {
    // Guard redirects to Google
  }

  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  @ApiOperation({ summary: 'Google OAuth callback' })
  async googleCallback(@Req() req: any, @Res() res: Response) {
    const { accessToken, refreshToken } = await this.authService.googleLogin(req.user);
    res.cookie('access_token', accessToken, cookieOptions(ACCESS_TOKEN_TTL));
    res.cookie('refresh_token', refreshToken, cookieOptions(REFRESH_TOKEN_TTL));
    // Redirect to frontend (with token params for cross-origin mobile browser support)
    const rawFrontend = process.env.FRONTEND_URL?.trim();
    const frontendUrl = rawFrontend && !rawFrontend.includes('localhost')
      ? rawFrontend
      : (process.env.NODE_ENV === 'production' ? 'https://come-mrcafe.vercel.app' : (rawFrontend || 'http://localhost:5173'));
    res.redirect(`${frontendUrl}/auth/google/callback?token=${accessToken}&refreshToken=${refreshToken}`);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get new access token using refresh token cookie or body/header' })
  async refresh(
    @Req() req: Request,
    @Body() body: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = req.cookies?.refresh_token || body?.refreshToken || (req.headers['x-refresh-token'] as string);
    if (!token) throw new UnauthorizedException('No refresh token provided');

    const { accessToken, refreshToken } = await this.authService.refreshTokens(token);
    res.cookie('access_token', accessToken, cookieOptions(ACCESS_TOKEN_TTL));
    res.cookie('refresh_token', refreshToken, cookieOptions(REFRESH_TOKEN_TTL));
    return { 
      message: 'Tokens refreshed',
      accessToken,
      refreshToken,
    };
  }
  @Get('staff')
  @Roles('admin', 'manager')
  getStaff(@Query('branchId') branchId?: string) {
    return this.authService.getStaff(branchId)
  }
@Get('me')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@ApiOperation({ summary: 'Get the currently logged-in user — used to restore session on page load' })
getCurrentUser(@CurrentUser() user: any) {
  return this.authService.getCurrentUser(user.id);
}
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout — clears cookies' })
  logout(@Res({ passthrough: true }) res: Response) {
    const clearOpts = { httpOnly: true, secure: isProduction, sameSite: (isProduction ? 'none' : 'lax') as 'none' | 'lax', path: '/' };
    res.clearCookie('access_token', clearOpts);
    res.clearCookie('refresh_token', clearOpts);
    return { message: 'Logged out successfully' };
  }
}