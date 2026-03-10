import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { RpcException } from '@nestjs/microservices';
import { status as GrpcStatus } from '@grpc/grpc-js';
import { PaymentsStorage } from './payments-storage';

const PaymentStatus = {
  AUTHORIZED: 1,
  CAPTURED: 2,
  REFUNDED: 3,
  FAILED: 4,
  DECLINED: 5,
};

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly storage = new PaymentsStorage();

  authorize(data: {
    orderId: string;
    amount: number;
    currency: string;
    idempotencyKey?: string;
  }) {
    if (data.idempotencyKey) {
      const existing = this.storage.findByIdempotencyKey(data.idempotencyKey);
      if (existing) {
        this.logger.log(
          `Idempotent hit for key="${data.idempotencyKey}", returning paymentId=${existing.paymentId}`,
        );
        return { paymentId: existing.paymentId, status: existing.status };
      }
    }

    const paymentId = randomUUID();

    this.storage.save({
      paymentId,
      orderId: data.orderId,
      amount: data.amount,
      currency: data.currency,
      status: PaymentStatus.AUTHORIZED,
      idempotencyKey: data.idempotencyKey,
    });

    this.logger.log(
      `Payment authorized: paymentId=${paymentId}, orderId=${data.orderId}, amount=${data.amount} ${data.currency}`,
    );

    return { paymentId, status: PaymentStatus.AUTHORIZED };
  }

  getPaymentStatus(data: { paymentId: string }) {
    const payment = this.storage.findById(data.paymentId);

    if (!payment) {
      throw new RpcException({
        code: GrpcStatus.NOT_FOUND,
        message: `Payment ${data.paymentId} not found`,
      });
    }

    return { paymentId: payment.paymentId, status: payment.status };
  }

  capture(data: { paymentId: string; idempotencyKey?: string }) {
    this.logger.warn(`Capture stub called for paymentId=${data.paymentId}`);
    return { paymentId: data.paymentId, status: PaymentStatus.CAPTURED };
  }

  refund(data: { paymentId: string; amount: number; idempotencyKey?: string }) {
    this.logger.warn(`Refund stub called for paymentId=${data.paymentId}`);
    return { paymentId: data.paymentId, status: PaymentStatus.REFUNDED };
  }
}
