import { Resolver, Query, Args, ResolveField, Parent } from '@nestjs/graphql';
import { OrdersService } from './orders.service';
import { OrderType } from './models/order.model';
import { OrderItemType } from './models/order-item.model';
import { ProductType } from './models/product.model';
import { OrdersFilterInput } from './inputs/orders-filter.input';
import { OrdersPaginationInput } from './inputs/orders-pagination.input';
import { Order } from './order.entity';
import { OrderItem } from '../order-items/order-item.entity';
import { Product } from '../products/product.entity';
import { ProductLoader } from './loaders/product.loader';
import { NotFoundException } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { SkipThrottle } from '@nestjs/throttler';

@Resolver(() => OrderType)
@SkipThrottle()
export class OrdersResolver {
  constructor(private readonly ordersService: OrdersService) {}

  @Public()
  @Query(() => [OrderType], { name: 'orders' })
  async getOrders(
    @Args('filter', { type: () => OrdersFilterInput, nullable: true })
    filter?: OrdersFilterInput,
    @Args('pagination', { type: () => OrdersPaginationInput, nullable: true })
    pagination?: OrdersPaginationInput,
  ): Promise<Order[]> {
    try {
      const orders = await this.ordersService.findAll(filter, pagination);

      return orders;
    } catch (error) {
      console.error('Error fetching orders:', error);

      throw new Error('Failed to fetch orders. Please try again.');
    }
  }

  @ResolveField(() => [OrderItemType])
  items(@Parent() order: Order): OrderItem[] {
    return order.orderItems;
  }
}

@Resolver(() => OrderItemType)
export class OrderItemResolver {
  constructor(private readonly productLoader: ProductLoader) {}

  @ResolveField(() => ProductType)
  async product(@Parent() orderItem: OrderItem): Promise<Product> {
    const product = await this.productLoader.load(orderItem.productId);

    if (!product) {
      throw new NotFoundException(
        `Product with id ${orderItem.productId} not found`,
      );
    }

    return product;
  }
}
