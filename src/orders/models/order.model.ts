import { ObjectType, Field, ID, Float } from '@nestjs/graphql';
import { OrderStatus } from './order-status.enum';
import { OrderItemType } from './order-item.model';

@ObjectType()
export class OrderType {
  @Field(() => ID)
  id: number;

  @Field(() => OrderStatus)
  status: OrderStatus;

  @Field(() => Float)
  total: number;

  @Field()
  createdAt: Date;

  @Field(() => [OrderItemType])
  items: OrderItemType[];
}
