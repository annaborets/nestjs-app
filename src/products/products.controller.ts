import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ProductsService } from './products.service';
import { Public } from '../auth/decorators/public.decorator';
import { PermissionsGuard } from '../auth/guards/permission.guard';

@Controller('products')
@UseGuards(PermissionsGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Public()
  @Get()
  findAll() {
    return this.productsService.findAll();
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.productsService.findOne(+id);
  }
}
