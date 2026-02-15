import { Injectable, Scope } from '@nestjs/common';
import DataLoader from 'dataloader';
import { ProductsService } from '../../products/products.service';
import { Product } from '../../products/product.entity';

@Injectable({ scope: Scope.REQUEST })
export class ProductLoader {
  constructor(private readonly productsService: ProductsService) {}

  private readonly loader = new DataLoader<number, Product | null>(
    async (productIds: readonly number[]): Promise<(Product | null)[]> => {
      const products = await this.productsService.findByIds([...productIds]);

      const productMap = new Map<number, Product>(
        products.map((p) => [p.id, p]),
      );

      return productIds.map((id) => productMap.get(id) || null);
    },
  );

  load(productId: number): Promise<Product | null> {
    return this.loader.load(productId);
  }
}
