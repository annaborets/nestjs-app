import { DataSource } from 'typeorm';
import { User } from '../users/users.entity';
import { Product } from '../products/product.entity';
import { Role } from '../auth/constants/roles.enum';
import * as bcrypt from 'bcrypt';

export async function seed(dataSource: DataSource) {
  const userRepository = dataSource.getRepository(User);
  const productRepository = dataSource.getRepository(Product);

  const existingAdmin = await userRepository.findOne({
    where: { email: process.env.ADMIN_EMAIL || 'admin@example.com' },
  });

  if (!existingAdmin) {
    const adminPassword = process.env.ADMIN_PASSWORD || 'Admin123!';
    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    await userRepository.save({
      name: 'System Admin',
      email: process.env.ADMIN_EMAIL || 'admin@example.com',
      password: hashedPassword,
      role: Role.ADMIN,
    });

    console.log('Admin user created');
  } else {
    console.log('Admin user already exists');
  }

  const existingProducts = await productRepository.count();
  if (existingProducts === 0) {
    const products = await productRepository.save([
      {
        name: 'Laptop',
        description: 'High-performance laptop',
        price: 999.99,
        stock: 10,
      },
      {
        name: 'Mouse',
        description: 'Wireless mouse',
        price: 29.99,
        stock: 50,
      },
      {
        name: 'Keyboard',
        description: 'Mechanical keyboard',
        price: 79.99,
        stock: 30,
      },
      {
        name: 'Monitor',
        description: '27-inch 4K monitor',
        price: 399.99,
        stock: 15,
      },
      {
        name: 'Headphones',
        description: 'Noise-cancelling headphones',
        price: 199.99,
        stock: 25,
      },
    ]);

    console.log('Created', products.length, 'products');
  } else {
    console.log('Products already exist:', existingProducts);
  }

  console.log('Seeding completed');
}
