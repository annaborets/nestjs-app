import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as microservices from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom, Observable, timer } from 'rxjs';
import { timeout, retry } from 'rxjs/operators';
import { status as GrpcStatus } from '@grpc/grpc-js';

interface AuthorizeRequest {
  orderId: string;
  amount: number;
  currency: string;
  idempotencyKey?: string;
}

interface AuthorizeResponse {
  paymentId: string;
  status: number;
}

interface GetPaymentStatusRequest {
  paymentId: string;
}

interface GetPaymentStatusResponse {
  paymentId: string;
  status: number;
}

interface PaymentsGrpcService {
  authorize(data: AuthorizeRequest): Observable<AuthorizeResponse>;
  getPaymentStatus(
    data: GetPaymentStatusRequest,
  ): Observable<GetPaymentStatusResponse>;
}

const TRANSIENT_CODES = new Set([
  GrpcStatus.UNAVAILABLE,
  GrpcStatus.DEADLINE_EXCEEDED,
  GrpcStatus.RESOURCE_EXHAUSTED,
]);

@Injectable()
export class PaymentsClientService implements OnModuleInit {
  private readonly logger = new Logger(PaymentsClientService.name);
  private paymentsService: PaymentsGrpcService;
  private readonly timeoutMs: number;
  private readonly retryAttempts: number;
  private readonly retryDelayMs: number;

  constructor(
    @Inject('PAYMENTS_PACKAGE')
    private readonly client: microservices.ClientGrpc,
    private readonly config: ConfigService,
  ) {
    this.timeoutMs = this.config.get<number>('payments.grpcTimeoutMs', 5000);
    this.retryAttempts = this.config.get<number>(
      'payments.grpcRetryAttempts',
      3,
    );
    this.retryDelayMs = this.config.get<number>(
      'payments.grpcRetryDelayMs',
      200,
    );

    this.logger.log(
      `gRPC config: timeout=${this.timeoutMs}ms, retries=${this.retryAttempts}, retryDelay=${this.retryDelayMs}ms`,
    );
  }

  onModuleInit() {
    this.paymentsService =
      this.client.getService<PaymentsGrpcService>('Payments');
  }

  async authorize(data: AuthorizeRequest): Promise<AuthorizeResponse> {
    this.logger.log(
      `Calling Payments.Authorize: orderId=${data.orderId}, amount=${data.amount} ${data.currency}`,
    );

    return firstValueFrom(
      this.withResilience(this.paymentsService.authorize(data)),
    );
  }

  async getPaymentStatus(paymentId: string): Promise<GetPaymentStatusResponse> {
    this.logger.log(
      `Calling Payments.GetPaymentStatus: paymentId=${paymentId}`,
    );

    return firstValueFrom(
      this.withResilience(this.paymentsService.getPaymentStatus({ paymentId })),
    );
  }

  private withResilience<T>(call: Observable<T>): Observable<T> {
    return call.pipe(
      timeout(this.timeoutMs),
      retry({
        count: this.retryAttempts,
        delay: (error, attempt) => {
          if (!this.isTransient(error)) {
            this.logger.warn(
              `Non-transient gRPC error (code=${error?.code}), not retrying`,
            );
            throw error;
          }

          const delayMs = this.retryDelayMs * Math.pow(2, attempt - 1);
          this.logger.warn(
            `Transient gRPC error (code=${error?.code}), retry ${attempt}/${this.retryAttempts} in ${delayMs}ms`,
          );
          return timer(delayMs);
        },
      }),
    );
  }

  private isTransient(error: any): boolean {
    const code = error?.code ?? error?.details?.code;
    return TRANSIENT_CODES.has(code);
  }
}
