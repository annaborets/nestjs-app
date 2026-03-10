import { MigrationInterface, QueryRunner } from "typeorm";

export class AddOutboxMessages1772376730362 implements MigrationInterface {
    name = 'AddOutboxMessages1772376730362'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "outbox_messages" ("id" SERIAL NOT NULL, "exchange" character varying NOT NULL, "routingKey" character varying NOT NULL, "payload" jsonb NOT NULL, "status" character varying NOT NULL DEFAULT 'pending', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "sentAt" TIMESTAMP, CONSTRAINT "PK_0171348f527c64b137e4d4f5b66" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "outbox_messages"`);
    }

}
