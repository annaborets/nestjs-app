import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OutboxMessage } from './outbox-message.entity';
import { RabbitmqService } from 'src/rabbitmq/rabbitmq.service';
import { OutboxStatus } from './models/outbox-status.enum';
import { Interval } from '@nestjs/schedule';

@Injectable()
export class OutboxRelayService {
  private readonly logger = new Logger(OutboxRelayService.name);

  constructor(
    @InjectRepository(OutboxMessage)
    private outboxRepository: Repository<OutboxMessage>,
    private rabbitmqService: RabbitmqService,
  ) {}

  @Interval(5000)
  async processOutbox() {
    const messages = await this.outboxRepository.find({
      where: { status: OutboxStatus.PENDING },
      order: { createdAt: 'ASC' },
      take: 10,
    });

    for (const message of messages) {
      try {
        this.rabbitmqService.publish(message.routingKey, message.payload);

        message.status = OutboxStatus.SENT;
        message.sentAt = new Date();
        await this.outboxRepository.save(message);

        this.logger.log(
          `Outbox message ${message.id} sent (routingKey=${message.routingKey})`,
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';

        this.logger.error(
          `Outbox message ${message.id} failed: ${errorMessage}`,
        );
      }
    }
  }
}
