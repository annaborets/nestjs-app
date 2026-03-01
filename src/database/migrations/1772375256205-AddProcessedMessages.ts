import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProcessedMessages1772375256205 implements MigrationInterface {
  name = 'AddProcessedMessages1772375256205';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "processed_messages" ("messageId" uuid NOT NULL, "orderId" integer NOT NULL, "handler" character varying, "processedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_7fc99fcf04ea327513eca2b809f" PRIMARY KEY ("messageId"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "processed_messages"`);
  }
}
