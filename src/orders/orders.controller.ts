import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { Permission } from '../auth/constants/permissions.enum';
import { PermissionsGuard } from '../auth/guards/permission.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/decorators/current-user.decorator';
import { Throttle } from '@nestjs/throttler';

@Controller('orders')
@UseGuards(PermissionsGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @RequirePermissions(Permission.WRITE_ORDERS)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  createOrder(
    @Body() createOrderDto: CreateOrderDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.ordersService.createOrder(createOrderDto, actor);
  }

  @Get()
  @RequirePermissions(Permission.READ_ALL_ORDERS)
  findAll() {
    return this.ordersService.findAll();
  }

  @Get(':id')
  @RequirePermissions(Permission.READ_ALL_ORDERS)
  findOne(@Param('id') id: string) {
    return this.ordersService.findOne(+id);
  }
}
