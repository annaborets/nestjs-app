import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqplib from 'amqplib';
import {
  RABBITMQ_EXCHANGE,
  ORDERS_QUEUE,
  ORDERS_DLQ,
} from './rabbitmq.constants';

@Injectable()
export class RabbitmqService implements OnModuleInit, OnModuleDestroy {
  private connection: amqplib.ChannelModel;
  private channel: amqplib.Channel;
  private readonly logger = new Logger(RabbitmqService.name);

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    await this.connect();
    await this.setupTopology();
  }

  async onModuleDestroy() {
    await this.channel?.close();
    await this.connection?.close();
    this.logger.log('RabbitMQ connection closed');
  }

  private async connect() {
    const url = this.configService.get<string>('RABBITMQ_URL');

    if (!url) {
      throw new Error('RABBITMQ_URL is not defined');
    }

    this.connection = await amqplib.connect(url);
    this.channel = await this.connection.createChannel();
    this.logger.log('Connected to RabbitMQ');
  }

  private async setupTopology() {
    await this.channel.assertExchange(RABBITMQ_EXCHANGE, 'direct', {
      durable: true,
    });

    await this.channel.assertQueue(ORDERS_QUEUE, {
      durable: true,
    });

    await this.channel.assertQueue(ORDERS_DLQ, {
      durable: true,
    });

    await this.channel.bindQueue(ORDERS_QUEUE, RABBITMQ_EXCHANGE, 'process');
    await this.channel.bindQueue(ORDERS_DLQ, RABBITMQ_EXCHANGE, 'dlq');

    this.logger.log('RabbitMQ topology created');
  }

  publish(routingKey: string, message: object) {
    this.channel.publish(
      RABBITMQ_EXCHANGE,
      routingKey,
      Buffer.from(JSON.stringify(message)),
      { persistent: true },
    );
    this.logger.log(`Published message with routing key: ${routingKey}`);
  }

  async consume(
    queue: string,
    callback: (msg: amqplib.ConsumeMessage) => Promise<void>,
  ) {
    await this.channel.prefetch(1);
    await this.channel.consume(
      queue,
      (msg) => {
        if (msg) {
          callback(msg).catch((err) => {
            this.logger.error(`Error processing message: ${err.message}`);
          });
        }
      },
      { noAck: false },
    );
    this.logger.log(`Consuming from queue: ${queue}`);
  }

  ack(msg: amqplib.ConsumeMessage) {
    this.channel.ack(msg);
  }

  nack(msg: amqplib.ConsumeMessage, requeue = false) {
    this.channel.nack(msg, false, requeue);
  }
}
