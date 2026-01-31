import { DataSource } from 'typeorm';
import { Product } from '../products/product.entity';
import { User } from '../users/users.entity';

export async function seed(dataSource: DataSource) {
    const userRepository = dataSource.getRepository(User);
    const productRepository = dataSource.getRepository(Product);

    const existingUsers = await userRepository.count();
    if (existingUsers > 0) {
        console.log('Seed data already exists, skipping...');
        return;
    }

    const users = await userRepository.save([
        { name: 'John Doe', email: 'john@example.com' },
        { name: 'Jane Smith', email: 'jane@example.com' },
        { name: 'Bob Wilson', email: 'bob@example.com' },
    ]);

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

    console.log('Seed data created successfully!');
    console.log(`Created ${users.length} users`);
    console.log(`Created ${products.length} products`);
}