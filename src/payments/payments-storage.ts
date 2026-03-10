export interface Payment {
  paymentId: string;
  orderId: string;
  amount: number;
  currency: string;
  status: number;
  idempotencyKey?: string;
}

export class PaymentsStorage {
  private payments = new Map<string, Payment>();
  private idempotencyIndex = new Map<string, string>();

  save(payment: Payment): void {
    this.payments.set(payment.paymentId, payment);
    if (payment.idempotencyKey) {
      this.idempotencyIndex.set(payment.idempotencyKey, payment.paymentId);
    }
  }

  findById(paymentId: string): Payment | undefined {
    return this.payments.get(paymentId);
  }

  findByIdempotencyKey(key: string): Payment | undefined {
    const paymentId = this.idempotencyIndex.get(key);
    return paymentId ? this.payments.get(paymentId) : undefined;
  }
}
