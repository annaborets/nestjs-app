import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { FilesService } from './files.service';
import { PresignFileDto } from './dto/presign-file.dto';
import { CompleteFileDto } from './dto/complete-file.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/decorators/current-user.decorator';
import { PermissionsGuard } from '../auth/guards/permission.guard';

@Controller('files')
@UseGuards(PermissionsGuard)
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post('presign')
  presign(@CurrentUser() user: JwtPayload, @Body() dto: PresignFileDto) {
    return this.filesService.presign(user.userId, dto);
  }

  @Post('complete')
  complete(@CurrentUser() user: JwtPayload, @Body() dto: CompleteFileDto) {
    return this.filesService.complete(user.userId, dto.fileId);
  }
}
