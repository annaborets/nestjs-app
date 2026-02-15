import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class S3Service {
  private s3Client: S3Client;
  private bucket: string;

  constructor(private configService: ConfigService) {
    this.bucket = this.configService.get<string>(
      'AWS_S3_BUCKET',
      'lesson9-files-private',
    );

    this.s3Client = new S3Client({
      region: this.configService.get<string>('AWS_REGION', 'us-east-1'),
      credentials: {
        accessKeyId: this.configService.get<string>(
          'AWS_ACCESS_KEY_ID',
          'minioadmin',
        ),
        secretAccessKey: this.configService.get<string>(
          'AWS_SECRET_ACCESS_KEY',
          'minioadmin',
        ),
      },
      endpoint: this.configService.get<string>(
        'S3_ENDPOINT',
        'http://localhost:9002',
      ),
      forcePathStyle: true,
    });
  }

  async generatePresignedUploadUrl(
    key: string,
    contentType: string,
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });

    return getSignedUrl(this.s3Client, command, { expiresIn: 300 });
  }

  async checkFileExists(
    key: string,
  ): Promise<{ exists: boolean; size: number }> {
    try {
      const result = await this.s3Client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
      return { exists: true, size: result.ContentLength || 0 };
    } catch {
      return { exists: false, size: 0 };
    }
  }

  getFileUrl(key: string): string {
    const baseUrl = this.configService.get<string>(
      'CLOUDFRONT_BASE_URL',
      `http://localhost:9002/${this.bucket}`,
    );
    return `${baseUrl}/${key}`;
  }
}
