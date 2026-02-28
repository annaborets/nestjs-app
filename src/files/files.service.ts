import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { FileRecord } from './file-record.entity';
import { S3Service } from './s3.service';
import { PresignFileDto } from './dto/presign-file.dto';
import { User } from '../users/users.entity';
import { FileStatus } from './file.enums';

@Injectable()
export class FilesService {
  constructor(
    @InjectRepository(FileRecord)
    private fileRecordRepository: Repository<FileRecord>,

    @InjectRepository(User)
    private userRepository: Repository<User>,

    private s3Service: S3Service,
  ) {}

  async presign(userId: number, dto: PresignFileDto) {
    if (dto.entityType === 'user' && dto.entityId !== userId) {
      throw new ForbiddenException('You can only upload files for yourself');
    }

    const extension = dto.contentType.split('/')[1];
    const filename = `${uuidv4()}.${extension}`;
    const key = this.generateKey(dto.entityType, dto.entityId, filename);

    const fileRecord = this.fileRecordRepository.create({
      ownerId: userId,
      entityId: dto.entityId,
      entityType: dto.entityType,
      key,
      contentType: dto.contentType,
      status: FileStatus.PENDING,
    });
    await this.fileRecordRepository.save(fileRecord);

    const uploadUrl = await this.s3Service.generatePresignedUploadUrl(
      key,
      dto.contentType,
    );

    return {
      fileId: fileRecord.id,
      key: fileRecord.key,
      uploadUrl,
      contentType: fileRecord.contentType,
    };
  }

  async complete(userId: number, fileId: string) {
    const fileRecord = await this.fileRecordRepository.findOne({
      where: { id: fileId },
    });

    if (!fileRecord) {
      throw new NotFoundException('File not found');
    }

    if (fileRecord.ownerId !== userId) {
      throw new ForbiddenException('This file does not belong to you');
    }

    if (fileRecord.status === FileStatus.READY) {
      throw new BadRequestException('File is already completed');
    }

    const s3Check = await this.s3Service.checkFileExists(fileRecord.key);
    if (!s3Check.exists) {
      throw new BadRequestException(
        'File has not been uploaded to storage yet',
      );
    }

    fileRecord.status = FileStatus.READY;
    fileRecord.size = s3Check.size;
    await this.fileRecordRepository.save(fileRecord);

    await this.linkToEntity(fileRecord);

    return {
      fileId: fileRecord.id,
      status: fileRecord.status,
      url: this.s3Service.getFileUrl(fileRecord.key),
    };
  }

  private generateKey(
    entityType: string,
    entityId: number,
    filename: string,
  ): string {
    const folder = entityType === 'user' ? 'avatars' : 'images';
    return `${entityType}s/${entityId}/${folder}/${filename}`;
  }

  private async linkToEntity(fileRecord: FileRecord): Promise<void> {
    if (fileRecord.entityType === 'user') {
      await this.userRepository.update(fileRecord.entityId, {
        avatarFileId: fileRecord.id,
      });
    }
  }
}
