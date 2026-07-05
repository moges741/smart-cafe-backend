import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// This guard attempts JWT auth but NEVER rejects the request
// If token is valid → req.user is populated
// If no token or invalid → req.user stays undefined (not 401)
@Injectable()
export class OptionalJwtGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    // Call parent — but catch any auth failure silently
    return super.canActivate(context);
  }

  // Override handleRequest — normally throws on failure
  // We return null instead so the request continues as guest
  handleRequest(_err: any, user: any) {
    return user ?? null;
  }
}