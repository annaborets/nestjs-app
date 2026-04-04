import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { ConfigModule } from '@nestjs/config';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductsModule } from './products/products.module';
import { OrdersModule } from './orders/orders.module';
import { OrderItemsModule } from './order-items/order-items.module';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';

import configuration from './config/configuration';
import { AuthModule } from './auth/auth.module';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AppResolver } from './app.resolver';
import { FilesModule } from './files/files.module';
import { RabbitmqModule } from './rabbitmq/rabbitmq.module';
import { WorkerModule } from './worker/worker.module';
import { OutboxModule } from './auth/outbox/outbox.module';
import { ScheduleModule } from '@nestjs/schedule';
import { AuditModule } from './audit/audit.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['.env.local', '.env'],
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 10,
      },
    ]),
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      autoLoadEntities: true,
      logging: false,
      synchronize: false,
      migrations: [__dirname + '/database/migrations/*{.ts,.js}'],
      migrationsRun: false,
      ssl:
        process.env.DATABASE_SSL === 'true'
          ? { rejectUnauthorized: false }
          : false,
    }),
    AuthModule,
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: true,
      playground: process.env.NODE_ENV !== 'production',
      introspection: process.env.NODE_ENV !== 'production',
      autoTransformHttpErrors: true,
      context: ({ req, res }) => ({ req, res }),
    }),
    UsersModule,
    ProductsModule,
    OrdersModule,
    OrderItemsModule,
    FilesModule,
    RabbitmqModule,
    WorkerModule,
    ScheduleModule.forRoot(),
    OutboxModule,
    AuditModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    AppResolver,
  ],
})
export class AppModule {}
