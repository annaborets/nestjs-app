import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { JwtPayload } from '../decorators/current-user.decorator';
import { Role } from '../constants/roles.enum';
import { Permission } from '../constants/permissions.enum';
import { ROLE_PERMISSIONS } from '../constants/role-permissions.map';

interface JwtValidatePayload {
  sub: number;
  email: string;
  role: Role;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private configService: ConfigService) {
    const secret = configService.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('JWT_SECRET is not defined');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  validate(payload: JwtValidatePayload): JwtPayload {
    const permissions: Permission[] = ROLE_PERMISSIONS[payload.role] || [];

    return {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
      permissions: permissions,
    };
  }
}
