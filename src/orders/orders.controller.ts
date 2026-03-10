import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  UseFilters,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { Permission } from '../auth/constants/permissions.enum';
import { PermissionsGuard } from '../auth/guards/permission.guard';
import { GrpcExceptionFilter } from 'src/payments-client/grpc-exception.filter';

@Controller('orders')
@UseGuards(PermissionsGuard)
@UseFilters(GrpcExceptionFilter)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @RequirePermissions(Permission.WRITE_ORDERS)
  createOrder(@Body() createOrderDto: CreateOrderDto) {
    return this.ordersService.createOrder(createOrderDto);
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
