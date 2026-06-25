import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// This guard runs JwtStrategy.validate() automatically
// Just extending AuthGuard('jwt') is all we need
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}