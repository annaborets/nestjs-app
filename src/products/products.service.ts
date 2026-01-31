import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Product } from "./product.entity";

@Injectable()
export class ProductsService {
    constructor(
        @InjectRepository(Product)
        private productRepository: Repository<Product>,
    ) { }

    findAll() {
        return this.productRepository.find();
    }

    findOne(id: number) {
        return this.productRepository.findOne({ where: { id } });
    }

    async checkStock(productId: number, quantity: number): Promise<boolean> {
        const product = await this.findOne(productId);
        if (!product) {
            throw new Error(`Product with id ${productId} not found`);
        }
        return product.stock >= quantity;
    }
}