import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderWorker } from './order.worker';
import { Order } from '../orders/order.entity';
import { OrderItem } from '../order-items/order-item.entity';
import { Product } from '../products/product.entity';
import { ProcessedMessage } from './processed-message.entity';
import { PaymentsClientModule } from 'src/payments-client/payments-client.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, OrderItem, Product, ProcessedMessage]),
    PaymentsClientModule,
  ],
  providers: [OrderWorker],
})
export class WorkerModule {}
