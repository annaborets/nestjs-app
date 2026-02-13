import { IsEnum } from 'class-validator';
import { Role } from '../../auth/constants/roles.enum';

export class UpdateUserRoleDto {
  @IsEnum(Role)
  role: Role;
}
