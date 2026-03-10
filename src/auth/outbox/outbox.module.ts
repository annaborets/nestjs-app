import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OutboxMessage } from './outbox-message.entity';
import { OutboxRelayService } from './outbox-relay.service';

@Module({
  imports: [TypeOrmModule.forFeature([OutboxMessage])],
  providers: [OutboxRelayService],
})
export class OutboxModule {}
