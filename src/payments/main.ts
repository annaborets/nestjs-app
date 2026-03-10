import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { PaymentsModule } from './payments.module';

async function bootstrap() {
  const grpcPort = process.env.PAYMENTS_GRPC_PORT ?? '5001';
  const grpcUrl = `0.0.0.0:${grpcPort}`;

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    PaymentsModule,
    {
      transport: Transport.GRPC,
      options: {
        package: 'payments',
        protoPath: join(process.cwd(), 'proto/payments.proto'),
        url: grpcUrl,
      },
    },
  );

  await app.listen();
  console.log(`Payments gRPC service is running on ${grpcUrl}`);
}
void bootstrap();
