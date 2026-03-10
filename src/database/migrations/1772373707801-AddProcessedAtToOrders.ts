import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProcessedAtToOrders1772373707801 implements MigrationInterface {
  name = 'AddProcessedAtToOrders1772373707801';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "orders" ADD "processedAt" TIMESTAMP`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "processedAt"`);
  }
}
