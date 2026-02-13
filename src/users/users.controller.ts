import { Controller, Get, Param, Patch, Body, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { Permission } from '../auth/constants/permissions.enum';
import { PermissionsGuard } from '../auth/guards/permission.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UpdateProfileDto } from './dto/update-profile.dto';
import type { JwtPayload } from '../auth/decorators/current-user.decorator';

@Controller('users')
@UseGuards(PermissionsGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  getProfile(@CurrentUser() user: JwtPayload) {
    return this.usersService.findOne(user.userId);
  }

  @Patch('me')
  updateProfile(
    @CurrentUser() user: JwtPayload,
    @Body() updateProfileDto: UpdateProfileDto,
  ) {
    return this.usersService.updateProfile(user.userId, updateProfileDto);
  }

  @Get()
  @RequirePermissions(Permission.READ_USERS)
  findAll() {
    return this.usersService.findAll();
  }

  @Get(':id')
  @RequirePermissions(Permission.READ_USERS)
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(+id);
  }

  @Patch(':id/role')
  @RequirePermissions(Permission.WRITE_USERS)
  updateRole(
    @Param('id') id: string,
    @Body() updateRoleDto: UpdateUserRoleDto,
  ) {
    return this.usersService.updateRole(+id, updateRoleDto.role);
  }
}
