import { ObjectType, Field, ID, Float, Int } from '@nestjs/graphql';
import { ProductType } from './product.model';

@ObjectType()
export class OrderItemType {
  @Field(() => ID)
  id: number;

  @Field(() => Int)
  quantity: number;

  @Field(() => Float)
  price: number;

  @Field(() => ProductType)
  product: ProductType;
}
