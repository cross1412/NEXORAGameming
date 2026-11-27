# NEXORAGameming

## Run locally

1. Install dependencies with `npm install`.
2. Create the MySQL database and tables with `mysql -u root -p < database/schema.sql`.
3. Copy `.env.example` to `.env` and set the MySQL connection values and a long random `SESSION_SECRET`.
4. Start the API with `npm run server`.
5. In another terminal, start the website with `npm run dev`, then open `http://localhost:4173`.

The registration and login screens use the API and MySQL database. The cart is saved in this browser. Checkout creates a **demo-only** order record in the signed-in user's order history; it does not charge a payment method or arrange shipping. Do not treat demo orders as real sales.

## Full-stack deployment (Vercel + Render)

Vercel serves the Vite website; Render runs the Express API. The API also needs a MySQL database reachable from Render. Vercel and Render cannot connect to the MySQL server running in this local workspace.

1. Create a hosted MySQL database. For Railway, open the MySQL service's **Settings → Networking**, enable **Public Access** to create a TCP Proxy, and use the proxy host and port for external connections; the private `MYSQLHOST`/`MYSQLPORT` values are only reachable from inside Railway. Railway notes that TCP Proxy traffic may incur network-egress charges. Select the database in its SQL console and apply the table statements in `database/schema.sql` (skip the initial `CREATE DATABASE` and `USE` statements if the provider has already selected the database).
2. Push the project to GitHub, then import the repository into Vercel and Render from the repository root. `vercel.json` sets the Vite build command and `dist` output; `render.yaml` configures the API service and prompts for its database connection values. Set `DB_SSL` to `true` if the database provider requires TLS. Render generates `SESSION_SECRET`.
3. Add `VITE_API_BASE_URL` to the Vercel project's Production environment variables using the Render API URL, for example `https://nexora-api.onrender.com` (no trailing slash), then redeploy the Vercel project.
4. Copy the final Vercel site origin (for example `https://nexora-gaming.vercel.app`) into Render's `CLIENT_ORIGIN` environment variable, with no trailing slash, and redeploy the API. The API uses secure cross-site cookies in production.
5. To initialize the hosted catalog, copy `.env.example` to `.env.production`, set the hosted MySQL values, and run `npm run db:seed:hosted` once. `.env.production` is ignored by Git. This seeds the demo catalog only; local accounts and orders are not copied.
6. Register a new account on the deployed website, then promote it against the hosted database with `npm run admin:promote:hosted -- your-email@example.com`. For these commands, `.env.production` must contain the hosted database connection values.

Vercel only deploys committed and pushed files from GitHub. After deployment, `/api/health` on the Render service should report `{"status":"ok","database":"connected"}`.

## Catalog and admin setup

If an existing database predates the current schema, apply only the migrations it needs:

```sql
-- Run only when the existing products table does not have this column.
ALTER TABLE products ADD COLUMN image_url VARCHAR(500) AFTER description;
ALTER TABLE orders MODIFY status ENUM('demo','pending','paid','processing','shipping','delivered','cancelled','refunded') DEFAULT 'pending';
```

Seed the 110 sample products once, after creating the schema. The command refuses to overwrite a non-empty product catalog:

```sh
npm run db:seed
```

Register your own account through the website, then promote that account from a terminal:

```sh
npm run admin:promote -- your-email@example.com
```

Sign out and back in to refresh the account role. Open the **Admin Dashboard** link in the footer or visit `#/admin`. Admin API endpoints enforce roles on the server: `super_admin` manages the full back office, while `order_staff` can view demo orders and `marketing` can manage promotions and demo reports. The admin panel does not process payments or shipping. Active coupons can be collected while signed in and applied to demo checkout; prices and discounts are recalculated by the API from MySQL.

The app database user needs `SELECT` and `INSERT`, plus only these update columns for admin tasks (adjust the account host to match your MySQL user):

```sql
GRANT UPDATE (category_id,brand_id,sku,name,price,old_price,`rank`,image_url,active)
  ON nexora_gaming.products TO 'nexora_app'@'127.0.0.1';
GRANT UPDATE (stock) ON nexora_gaming.product_variants TO 'nexora_app'@'127.0.0.1';
GRANT UPDATE (role) ON nexora_gaming.users TO 'nexora_app'@'127.0.0.1';
GRANT UPDATE (code,discount_type,discount_value,minimum_order,usage_limit,starts_at,ends_at,active)
  ON nexora_gaming.vouchers TO 'nexora_app'@'127.0.0.1';
GRANT UPDATE (used_at) ON nexora_gaming.user_vouchers TO 'nexora_app'@'127.0.0.1';
```