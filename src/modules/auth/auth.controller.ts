import {
  Controller, Post, Body, HttpCode,
  HttpStatus, Res, Req, UseGuards,
  Get, Query
} from '@nestjs/common';
import { Response, Request } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { CreateStaffDto } from './dto/create-staff.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
const ACCESS_TOKEN_TTL  = 60 * 60 * 1000;
const REFRESH_TOKEN_TTL = 30 * 24 * 60 * 60 * 1000;

const cookieOptions = (maxAge: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
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

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login — sets HttpOnly cookie tokens' })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken } = await this.authService.login(dto);
    res.cookie('access_token', accessToken, cookieOptions(ACCESS_TOKEN_TTL));
    res.cookie('refresh_token', refreshToken, cookieOptions(REFRESH_TOKEN_TTL));
    return { message: 'Login successful' };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get new access token using refresh token cookie' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = req.cookies?.refresh_token;
    if (!token) throw new Error('No refresh token');

    const { accessToken, refreshToken } = await this.authService.refreshTokens(token);
    res.cookie('access_token', accessToken, cookieOptions(ACCESS_TOKEN_TTL));
    res.cookie('refresh_token', refreshToken, cookieOptions(REFRESH_TOKEN_TTL));
    return { message: 'Tokens refreshed' };
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
    res.clearCookie('access_token');
    res.clearCookie('refresh_token');
    return { message: 'Logged out successfully' };
  }
}