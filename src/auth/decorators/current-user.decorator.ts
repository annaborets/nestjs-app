import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Role } from '../constants/roles.enum';
import { Permission } from '../constants/permissions.enum';

export interface JwtPayload {
  userId: number;
  email: string;
  role: Role;
  permissions: Permission[];
}

interface RequestWithUser extends Request {
  user: JwtPayload;
}

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): JwtPayload => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();
    return request.user;
  },
);
