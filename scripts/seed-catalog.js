import mysql from 'mysql2/promise';
import { categories, products } from '../src/catalog.js';

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'nexora_gaming',
  ssl: process.env.DB_SSL === 'true' ? {} : undefined,
  waitForConnections: true,
  connectionLimit: 2
});

const slugify = (value, prefix) => {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return slug || `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
};

const connection = await pool.getConnection();
try {
  const [[{ productCount }]] = await connection.query('SELECT COUNT(*) AS productCount FROM products');
  if (Number(productCount) > 0) {
    throw new Error('Products already exist; refusing to overwrite the catalog.');
  }

  await connection.beginTransaction();
  const categoryIds = new Map();
  for (const [name] of categories) {
    const [result] = await connection.execute(
      'INSERT INTO categories (name, slug) VALUES (?, ?)',
      [name, slugify(name, 'category')]
    );
    categoryIds.set(name, result.insertId);
  }

  const brandIds = new Map();
  for (const name of new Set(products.map(product => product.brand))) {
    const [result] = await connection.execute(
      'INSERT INTO brands (name, slug) VALUES (?, ?)',
      [name, slugify(name, 'brand')]
    );
    brandIds.set(name, result.insertId);
  }

  for (const product of products) {
    const [result] = await connection.execute(
      `INSERT INTO products
        (category_id, brand_id, sku, name, price, old_price, \`rank\`, image_url, pros, cons)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        categoryIds.get(product.category),
        brandIds.get(product.brand),
        product.sku,
        product.name,
        product.price,
        product.oldPrice,
        product.rank,
        product.image,
        JSON.stringify(product.pros),
        JSON.stringify(product.cons)
      ]
    );
    await connection.execute(
      'INSERT INTO product_variants (product_id, name, sku_variant, stock) VALUES (?, ?, ?, 0)',
      [result.insertId, 'Default', `${product.sku}-DEFAULT`]
    );
  }

  await connection.commit();
  console.log(`Seeded ${products.length} demo products.`);
} catch (error) {
  await connection.rollback();
  console.error(error.message);
  process.exitCode = 1;
} finally {
  connection.release();
  await pool.end();
}
