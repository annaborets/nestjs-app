import { InputType, Field } from '@nestjs/graphql';
import { OrderStatus } from '../models/order-status.enum';

@InputType()
export class OrdersFilterInput {
  @Field(() => OrderStatus, { nullable: true })
  status?: OrderStatus;

  @Field({ nullable: true })
  dateFrom?: Date;

  @Field({ nullable: true })
  dateTo?: Date;
}
