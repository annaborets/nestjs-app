import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from './order.entity';
import { OrderItem } from '../order-items/order-item.entity';
import { Product } from '../products/product.entity';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { ProductsModule } from 'src/products/products.module';
import { OrdersResolver, OrderItemResolver } from './orders.resolver';
import { ProductLoader } from './loaders/product.loader';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, OrderItem, Product]),
    ProductsModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService, OrdersResolver, OrderItemResolver, ProductLoader],
  exports: [OrdersService],
})
export class OrdersModule {}
