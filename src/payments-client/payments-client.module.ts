import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { join } from 'path';
import { PaymentsClientService } from './payments-client.service';

@Module({
  imports: [
    ConfigModule,
    ClientsModule.registerAsync([
      {
        name: 'PAYMENTS_PACKAGE',
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.GRPC,
          options: {
            package: 'payments',
            protoPath: join(process.cwd(), 'proto/payments.proto'),
            url: config.get<string>('payments.grpcUrl'),
          },
        }),
      },
    ]),
  ],
  providers: [PaymentsClientService],
  exports: [PaymentsClientService],
})
export class PaymentsClientModule {}
