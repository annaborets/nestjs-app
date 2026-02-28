import { AppDataSource } from './data-source';

async function run() {
  try {
    await AppDataSource.initialize();
    console.log('Running migrations...');
    await AppDataSource.runMigrations();
    console.log('Migrations completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await AppDataSource.destroy();
  }
}

void run();
