import { NestFactory } from "@nestjs/core";
import { DataSource } from "typeorm";
import { seed } from "./seed";
import { AppModule } from "../app.module";

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const dataSource = app.get(DataSource);

  try {
    await seed(dataSource);
    console.log('Seeding completed!');
  } catch (error) {
    console.error('Seeding failed:', error);
  } finally {
    await app.close();
  }
}

bootstrap();