import { IsNumber, IsString, IsArray, ValidateNested, Min, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateOrderItemDto {
    @IsNumber()
    productId: number;

    @IsNumber()
    @Min(1, { message: 'Quantity must be at least 1' })
    quantity: number;
}

export class CreateOrderDto {
    @IsNumber()
    userId: number;

    @IsString()
    @IsNotEmpty()
    idempotencyKey: string;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateOrderItemDto)
    items: CreateOrderItemDto[];
}