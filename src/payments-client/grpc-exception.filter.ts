import {
  Catch,
  ExceptionFilter,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { status as GrpcStatus } from '@grpc/grpc-js';

const GRPC_TO_HTTP: Record<number, { status: number; message: string }> = {
  [GrpcStatus.NOT_FOUND]: {
    status: HttpStatus.NOT_FOUND,
    message: 'Payment not found',
  },
  [GrpcStatus.ALREADY_EXISTS]: {
    status: HttpStatus.CONFLICT,
    message: 'Payment already exists',
  },
  [GrpcStatus.INVALID_ARGUMENT]: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Invalid payment request',
  },
  [GrpcStatus.DEADLINE_EXCEEDED]: {
    status: HttpStatus.REQUEST_TIMEOUT,
    message: 'Payment service timeout',
  },
  [GrpcStatus.UNAVAILABLE]: {
    status: HttpStatus.SERVICE_UNAVAILABLE,
    message: 'Payment service unavailable',
  },
  [GrpcStatus.RESOURCE_EXHAUSTED]: {
    status: HttpStatus.TOO_MANY_REQUESTS,
    message: 'Payment service overloaded',
  },
  [GrpcStatus.PERMISSION_DENIED]: {
    status: HttpStatus.FORBIDDEN,
    message: 'Payment permission denied',
  },
  [GrpcStatus.UNAUTHENTICATED]: {
    status: HttpStatus.UNAUTHORIZED,
    message: 'Payment authentication failed',
  },
  [GrpcStatus.INTERNAL]: {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    message: 'Payment service error',
  },
};

@Catch()
export class GrpcExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GrpcExceptionFilter.name);

  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();

    if (exception instanceof HttpException) {
      return response
        .status(exception.getStatus())
        .json(exception.getResponse());
    }

    const grpcCode = exception?.code;
    const mapped = GRPC_TO_HTTP[grpcCode];

    if (mapped) {
      this.logger.warn(
        `gRPC error mapped: code=${grpcCode} → HTTP ${mapped.status} (${mapped.message})`,
      );
      return response.status(mapped.status).json({
        statusCode: mapped.status,
        message: mapped.message,
        error: exception?.details || exception?.message,
      });
    }

    this.logger.error(
      `Unhandled exception: ${exception?.message}`,
      exception?.stack,
    );
    return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
    });
  }
}
