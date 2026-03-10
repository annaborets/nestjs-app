import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { OrderItem } from 'src/order-items/order-item.entity';
import { OrderStatus } from 'src/orders/models/order-status.enum';
import { Order } from 'src/orders/order.entity';
import { PaymentsClientService } from 'src/payments-client/payments-client.service';
import { Product } from 'src/products/product.entity';
import { ORDERS_QUEUE, MAX_RETRIES } from 'src/rabbitmq/rabbitmq.constants';
import { RabbitmqService } from 'src/rabbitmq/rabbitmq.service';
import { DataSource, Repository } from 'typeorm';

interface OrderMessage {
  messageId: string;
  orderId: number;
  createdAt: string;
  attempt: number;
}

@Injectable()
export class OrderWorker implements OnModuleInit {
  private readonly logger = new Logger(OrderWorker.name);

  constructor(
    private rabbitmqService: RabbitmqService,
    private dataSource: DataSource,
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    private paymentsClient: PaymentsClientService,
  ) {}

  async onModuleInit() {
    await this.rabbitmqService.consume(ORDERS_QUEUE, async (msg) => {
      const content: OrderMessage = JSON.parse(
        msg.content.toString(),
      ) as OrderMessage;
      const { messageId, orderId, attempt } = content;

      this.logger.log(
        `Received message: messageId=${messageId}, orderId=${orderId}, attempt=${attempt}`,
      );

      try {
        await this.processOrder(messageId, orderId);

        this.logger.log(`SUCCESS: orderId=${orderId}, messageId=${messageId}`);
        this.rabbitmqService.ack(msg);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';

        if (errorMessage === 'DUPLICATE') {
          this.logger.warn(
            `DUPLICATE: messageId=${messageId}, already processed, skipping`,
          );
          this.rabbitmqService.ack(msg);
          return;
        }

        this.logger.error(
          `FAILED: orderId=${orderId}, attempt=${attempt}, error=${errorMessage}`,
        );

        if (attempt < MAX_RETRIES - 1) {
          this.rabbitmqService.publish('process', {
            ...content,
            attempt: attempt + 1,
          });
          this.logger.warn(
            `RETRY: orderId=${orderId}, next attempt=${attempt + 1}`,
          );
        } else {
          this.rabbitmqService.publish('dlq', content);
          await this.orderRepository.update(orderId, {
            status: OrderStatus.FAILED,
          });
          this.logger.error(
            `DLQ: orderId=${orderId}, messageId=${messageId}, max retries reached`,
          );
        }

        this.rabbitmqService.ack(msg);
      }
    });
  }

  private async processOrder(
    messageId: string,
    orderId: number,
  ): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      try {
        await queryRunner.query(
          `INSERT INTO processed_messages("messageId", "orderId", "handler") VALUES ($1, $2, $3)`,
          [messageId, orderId, 'OrderWorker'],
        );
      } catch {
        await queryRunner.rollbackTransaction();
        throw new Error('DUPLICATE');
      }

      const order = await queryRunner.manager.findOne(Order, {
        where: { id: orderId },
        relations: ['orderItems'],
      });

      if (!order) {
        throw new Error(`Order ${orderId} not found`);
      }

      if (order.status !== OrderStatus.PENDING) {
        this.logger.warn(
          `Order ${orderId} is already ${order.status}, skipping processing`,
        );
        await queryRunner.commitTransaction();
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 300));

      let totalPrice = 0;

      for (const item of order.orderItems) {
        const product = await queryRunner.manager.findOne(Product, {
          where: { id: item.productId },
          lock: { mode: 'pessimistic_write' },
        });

        if (!product) {
          throw new Error(`Product ${item.productId} not found`);
        }

        if (product.stock < item.quantity) {
          throw new Error(
            `Not enough stock for "${product.name}". Available: ${product.stock}, requested: ${item.quantity}`,
          );
        }

        product.stock -= item.quantity;
        await queryRunner.manager.save(Product, product);

        item.price = Number(product.price);
        await queryRunner.manager.save(OrderItem, item);

        totalPrice += Number(product.price) * item.quantity;
      }

      const paymentResult = await this.paymentsClient.authorize({
        orderId: String(order.id),
        amount: Math.round(totalPrice * 100),
        currency: 'USD',
        idempotencyKey: `payment-${order.idempotencyKey}`,
      });

      this.logger.log(
        `Payment authorized: paymentId=${paymentResult.paymentId}, status=${paymentResult.status}`,
      );

      order.total = totalPrice;
      order.status = OrderStatus.PROCESSED;
      order.processedAt = new Date();
      await queryRunner.manager.save(Order, order);

      await queryRunner.commitTransaction();
    } catch (error) {
      if (error instanceof Error && error.message !== 'DUPLICATE') {
        await queryRunner.rollbackTransaction();
      }
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
