import { Injectable, Logger, UnauthorizedException } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { ConfigService } from '@nestjs/config'
import { UsersService } from '../../users/users.service'

export interface JwtPayload {
  sub: string
  email: string
  role: string
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name)
  private readonly maxRetries = 3
  private readonly retryDelay = 500

  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (request) => request?.cookies?.access_token,
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') as string,
    })
  }

  async validate(payload: JwtPayload) {
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const user = await this.usersService.findById(payload.sub)

        if (!user || !user.isActive) {
          throw new UnauthorizedException('User is inactive or not found')
        }

        return user
      } catch (error: any) {
        // Log and retry on timeout
        if (error.code === 'ETIMEDOUT' && attempt < this.maxRetries) {
          this.logger.warn(
            `JWT validation timeout (attempt ${attempt}/${this.maxRetries}), retrying...`,
          )
          await new Promise(resolve => setTimeout(resolve, this.retryDelay * attempt))
          continue
        }

        // Don't retry on authorization errors
        if (error instanceof UnauthorizedException) {
          throw error
        }

        // Log other errors
        if (attempt === this.maxRetries) {
          this.logger.error(`JWT validation failed after ${this.maxRetries} attempts:`, error)
        }

        // Throw on last attempt
        if (attempt === this.maxRetries) {
          throw new UnauthorizedException('Authentication failed')
        }
      }
    }
  }
}