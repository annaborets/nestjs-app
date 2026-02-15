import {
  Injectable,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Order } from './order.entity';
import { OrderItem } from '../order-items/order-item.entity';
import { Product } from '../products/product.entity';
import { CreateOrderDto } from './dto/create-order.dto';

@Injectable()
export class OrdersService {
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
      console.log(
        `Idempotency key ${dto.idempotencyKey} already exists, returning existing order`,
      );
      return existingOrder;
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      let totalPrice = 0;
      const orderItemsToCreate: Array<{
        product: Product;
        quantity: number;
        price: number;
      }> = [];

      for (const item of dto.items) {
        const product = await queryRunner.manager.findOne(Product, {
          where: { id: item.productId },
          lock: { mode: 'pessimistic_write' },
        });

        if (!product) {
          throw new BadRequestException(
            `Product with id ${item.productId} not found`,
          );
        }

        if (product.stock < item.quantity) {
          throw new ConflictException(
            `Not enough stock for product "${product.name}". Available: ${product.stock}, requested: ${item.quantity}`,
          );
        }

        product.stock -= item.quantity;
        await queryRunner.manager.save(Product, product);

        const itemPrice = Number(product.price) * item.quantity;
        totalPrice += itemPrice;

        orderItemsToCreate.push({
          product,
          quantity: item.quantity,
          price: Number(product.price),
        });
      }

      const order = queryRunner.manager.create(Order, {
        userId: dto.userId,
        idempotencyKey: dto.idempotencyKey,
        total: totalPrice,
        status: 'pending',
      });

      const savedOrder = await queryRunner.manager.save(Order, order);

      const orderItems = orderItemsToCreate.map((item) =>
        queryRunner.manager.create(OrderItem, {
          orderId: savedOrder.id,
          productId: item.product.id,
          quantity: item.quantity,
          price: item.price,
        }),
      );

      await queryRunner.manager.save(OrderItem, orderItems);

      await queryRunner.commitTransaction();

      console.log(
        `Order ${savedOrder.id} created successfully with idempotency key ${dto.idempotencyKey}`,
      );

      const finalOrder = await this.orderRepository.findOne({
        where: { id: savedOrder.id },
        relations: ['orderItems', 'orderItems.product'],
      });

      if (!finalOrder) {
        throw new Error('Failed to retrieve created order');
      }

      return finalOrder;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error('Order creation failed, transaction rolled back');
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
