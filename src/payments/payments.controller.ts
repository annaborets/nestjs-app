import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { PaymentsService } from './payments.service';

@Controller()
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @GrpcMethod('Payments', 'Authorize')
  authorize(data: {
    orderId: string;
    amount: number;
    currency: string;
    idempotencyKey?: string;
  }) {
    return this.paymentsService.authorize(data);
  }

  @GrpcMethod('Payments', 'GetPaymentStatus')
  getPaymentStatus(data: { paymentId: string }) {
    return this.paymentsService.getPaymentStatus(data);
  }

  @GrpcMethod('Payments', 'Capture')
  capture(data: { paymentId: string; idempotencyKey?: string }) {
    return this.paymentsService.capture(data);
  }

  @GrpcMethod('Payments', 'Refund')
  refund(data: { paymentId: string; amount: number; idempotencyKey?: string }) {
    return this.paymentsService.refund(data);
  }
}
