import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { randomUUID } from 'crypto';
import { Order } from './order.entity';
import { OrderItem } from '../order-items/order-item.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { RABBITMQ_EXCHANGE } from '../rabbitmq/rabbitmq.constants';
import { OrderStatus } from './models/order-status.enum';
import { OutboxMessage } from 'src/auth/outbox/outbox-message.entity';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    private dataSource: DataSource,
  ) {}

  async createOrder(dto: CreateOrderDto): Promise<Order> {
    const existingOrder = await this.orderRepository.findOne({
      where: { idempotencyKey: dto.idempotencyKey },
      relations: ['orderItems', 'orderItems.product'],
    });

    if (existingOrder) {
      this.logger.log(
        `Idempotency key ${dto.idempotencyKey} already exists, returning existing order`,
      );
      return existingOrder;
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const order = queryRunner.manager.create(Order, {
        userId: dto.userId,
        idempotencyKey: dto.idempotencyKey,
        total: 0,
        status: OrderStatus.PENDING,
      });

      const savedOrder = await queryRunner.manager.save(Order, order);

      const orderItems = dto.items.map((item) =>
        queryRunner.manager.create(OrderItem, {
          orderId: savedOrder.id,
          productId: item.productId,
          quantity: item.quantity,
          price: 0,
        }),
      );

      await queryRunner.manager.save(OrderItem, orderItems);

      const messageId = randomUUID();

      const outboxMessage = queryRunner.manager.create(OutboxMessage, {
        exchange: RABBITMQ_EXCHANGE,
        routingKey: 'process',
        payload: {
          messageId,
          orderId: savedOrder.id,
          createdAt: new Date().toISOString(),
          attempt: 0,
        },
      });

      await queryRunner.manager.save(OutboxMessage, outboxMessage);

      await queryRunner.commitTransaction();

      this.logger.log(
        `Order ${savedOrder.id} created (PENDING), outbox message ${messageId} saved`,
      );

      const finalOrder = await this.orderRepository.findOne({
        where: { id: savedOrder.id },
        relations: ['orderItems', 'orderItems.product'],
      });

      return finalOrder!;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async findAll(
    filter?: { status?: string; dateFrom?: Date; dateTo?: Date },
    pagination?: { limit?: number; offset?: number },
  ) {
    const { limit = 10, offset = 0 } = pagination || {};

    const queryBuilder = this.orderRepository
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.orderItems', 'orderItems')
      .leftJoinAndSelect('order.user', 'user')
      .orderBy('order.createdAt', 'DESC')
      .take(limit)
      .skip(offset);

    if (filter?.status) {
      queryBuilder.andWhere('order.status = :status', {
        status: filter.status,
      });
    }

    if (filter?.dateFrom) {
      queryBuilder.andWhere('order.createdAt >= :dateFrom', {
        dateFrom: filter.dateFrom,
      });
    }

    if (filter?.dateTo) {
      queryBuilder.andWhere('order.createdAt <= :dateTo', {
        dateTo: filter.dateTo,
      });
    }

    return queryBuilder.getMany();
  }

  async findOne(id: number) {
    return this.orderRepository.findOne({
      where: { id },
      relations: ['orderItems', 'orderItems.product', 'user'],
    });
  }
}
