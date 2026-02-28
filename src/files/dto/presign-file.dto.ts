import { IsString, IsNumber, IsIn } from 'class-validator';

export class PresignFileDto {
  @IsString()
  @IsIn(['image/jpeg', 'image/png', 'image/webp'])
  contentType: string;

  @IsString()
  @IsIn(['user', 'product'])
  entityType: string;

  @IsNumber()
  entityId: number;
}
