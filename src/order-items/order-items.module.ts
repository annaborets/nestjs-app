import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderItem } from './order-item.entity';

@Module({
  imports: [TypeOrmModule.forFeature([OrderItem])],
  exports: [TypeOrmModule],
})
export class OrderItemsModule {}
