import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcrypt';
import { RefreshDto } from './dto/refresh.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { AuditService } from '../audit/audit.service';
import { Request } from 'express';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private auditService: AuditService,
  ) {}

  async register(registerDto: RegisterDto, req?: Request) {
    const existingUser = await this.usersService.findByEmail(registerDto.email);
    if (existingUser) {
      this.auditService.log({
        action: 'auth.register_failed',
        actorId: null,
        actorEmail: registerDto.email,
        targetType: 'auth',
        targetId: null,
        outcome: 'failure',
        reason: 'email_already_in_use',
        ip: req?.ip,
        userAgent: req?.get('user-agent'),
      });
      throw new ConflictException('Email already in use');
    }

    const user = await this.usersService.create(
      registerDto.name,
      registerDto.email,
      registerDto.password,
    );

    this.auditService.log({
      action: 'auth.register_success',
      actorId: user.id,
      actorEmail: user.email,
      targetType: 'user',
      targetId: user.id,
      outcome: 'success',
      ip: req?.ip,
      userAgent: req?.get('user-agent'),
    });

    return this.generateTokens(user.id, user.email, user.role);
  }

  async login(loginDto: LoginDto, req?: Request) {
    const user = await this.usersService.findByEmail(loginDto.email);
    if (!user) {
      this.auditService.log({
        action: 'auth.login_failed',
        actorId: null,
        actorEmail: loginDto.email,
        targetType: 'auth',
        targetId: null,
        outcome: 'failure',
        reason: 'user_not_found',
        ip: req?.ip,
        userAgent: req?.get('user-agent'),
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      user.password,
    );
    if (!isPasswordValid) {
      this.auditService.log({
        action: 'auth.login_failed',
        actorId: user.id,
        actorEmail: loginDto.email,
        targetType: 'auth',
        targetId: user.id,
        outcome: 'failure',
        reason: 'invalid_password',
        ip: req?.ip,
        userAgent: req?.get('user-agent'),
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    this.auditService.log({
      action: 'auth.login_success',
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      targetType: 'auth',
      targetId: user.id,
      outcome: 'success',
      ip: req?.ip,
      userAgent: req?.get('user-agent'),
    });

    return this.generateTokens(user.id, user.email, user.role);
  }

  async logout(userId: number, req?: Request) {
    await this.usersService.updateRefreshToken(userId, undefined);

    this.auditService.log({
      action: 'auth.logout',
      actorId: userId,
      targetType: 'auth',
      targetId: userId,
      outcome: 'success',
      ip: req?.ip,
      userAgent: req?.get('user-agent'),
    });

    return { message: 'Logged out successfully' };
  }

  private async generateTokens(userId: number, email: string, role: string) {
    const payload = {
      sub: userId,
      email: email,
      role: role,
    };

    const accessToken = this.jwtService.sign(payload, { expiresIn: '15m' });
    const refreshToken = this.jwtService.sign(payload, { expiresIn: '7d' });

    await this.usersService.updateRefreshToken(userId, refreshToken);

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
    };
  }

  async refresh(refreshDto: RefreshDto) {
    try {
      const payload: { sub: number; email: string; role: string } =
        this.jwtService.verify(refreshDto.refresh_token);

      const user = await this.usersService.findOne(payload.sub);
      if (!user || !user.refreshToken) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const isValid = await bcrypt.compare(
        refreshDto.refresh_token,
        user.refreshToken,
      );
      if (!isValid) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      return this.generateTokens(user.id, user.email, user.role);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async changePassword(
    userId: number,
    changePasswordDto: ChangePasswordDto,
    req?: Request,
  ) {
    try {
      await this.usersService.changePassword(
        userId,
        changePasswordDto.currentPassword,
        changePasswordDto.newPassword,
      );

      this.auditService.log({
        action: 'auth.password_changed',
        actorId: userId,
        targetType: 'user',
        targetId: userId,
        outcome: 'success',
        ip: req?.ip,
        userAgent: req?.get('user-agent'),
      });

      return { message: 'Password changed successfully' };
    } catch (error) {
      this.auditService.log({
        action: 'auth.password_change_failed',
        actorId: userId,
        targetType: 'user',
        targetId: userId,
        outcome: 'failure',
        reason: 'invalid_current_password',
        ip: req?.ip,
        userAgent: req?.get('user-agent'),
      });
      throw error;
    }
  }
}
