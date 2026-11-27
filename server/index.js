import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import mysql from 'mysql2/promise';
import bcrypt from 'bcrypt';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const app = express();
const port = Number(process.env.PORT || 3001);
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);
const sessionSecret = process.env.SESSION_SECRET || randomBytes(32).toString('hex');
const sessionCookie = 'nexora_session';
const sessionDuration = 7 * 24 * 60 * 60 * 1000;
const allowedOrigins = new Set([process.env.CLIENT_ORIGIN || 'http://localhost:4173']);
if (process.env.NODE_ENV !== 'production') {
  allowedOrigins.add('http://localhost:4173');
  allowedOrigins.add('http://127.0.0.1:4173');
}

if (!process.env.SESSION_SECRET) {
  console.warn('SESSION_SECRET is not set; sign-in sessions will expire when the API restarts.');
}

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'nexora_gaming',
  ssl: process.env.DB_SSL === 'true' ? {} : undefined,
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: true
});

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({
  origin: (origin,callback) => callback(null,!origin || allowedOrigins.has(origin)),
  credentials: true
}));
app.use(express.json({limit:'10mb'}));
app.use(express.urlencoded({extended:false,limit:'10mb'}));
app.use(cookieParser());
app.use(rateLimit({windowMs:15*60*1000,max:300,standardHeaders:true,legacyHeaders:false}));

app.use((req,res,next)=>{
  if(['POST','PUT','PATCH','DELETE'].includes(req.method)){
    const origin=req.get('origin');
    if(origin && !allowedOrigins.has(origin)) {
      return res.status(403).json({error:'Origin not allowed'});
    }
  }
  next();
});

const createSession = userId => {
  const payload = Buffer.from(JSON.stringify({
    userId,
    expiresAt: Date.now() + sessionDuration
  })).toString('base64url');
  const signature = createHmac('sha256', sessionSecret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
};

const readSession = token => {
  if (typeof token !== 'string') return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;

  const expected = createHmac('sha256', sessionSecret).update(payload).digest();
  let actual;
  try {
    actual = Buffer.from(signature, 'base64url');
  } catch {
    return null;
  }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return Number.isInteger(session.userId) && session.expiresAt > Date.now()
      ? session.userId
      : null;
  } catch {
    return null;
  }
};

const setSessionCookie = (res, userId) => {
  res.cookie(sessionCookie, createSession(userId), {
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: sessionDuration,
    path: '/'
  });
};

const getCurrentUser = async req => {
  const userId = readSession(req.cookies[sessionCookie]);
  if (!userId) return null;
  const [rows] = await pool.execute(
    'SELECT id, email, display_name, role FROM users WHERE id = ?',
    [userId]
  );
  return rows[0] || null;
};

const requireRoles = (...roles) => async (req,res,next) => {
  try {
    const user = await getCurrentUser(req);
    if(!user) return res.status(401).json({error:'กรุณาเข้าสู่ระบบก่อน'});
    if(!roles.includes(user.role)) return res.status(403).json({error:'ไม่มีสิทธิ์เข้าถึงส่วนนี้'});
    req.adminUser = user;
    next();
  } catch(error) {
    res.status(500).json({error:'ตรวจสอบสิทธิ์ไม่สำเร็จ'});
  }
};

const writeAdminLog = async (connection,req,action,entityType,entityId,details) => {
  await connection.execute(
    `INSERT INTO admin_logs (admin_id, action, entity_type, entity_id, details, ip_hash)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      req.adminUser.id,
      action,
      entityType,
      String(entityId),
      JSON.stringify(details),
      createHash('sha256').update(req.ip || 'unknown').digest('hex')
    ]
  );
};

const escapeLike = value => String(value).replace(/[\\%_]/g, '\\$&');

app.get('/api/health', async (_req,res)=>{
  try { await pool.query('SELECT 1'); res.json({status:'ok',database:'connected'}); }
  catch(error){ res.status(503).json({status:'error',database:'unavailable'}); }
});

app.get('/api/auth/me', async (req,res)=>{
  try {
    res.json({ user: await getCurrentUser(req) });
  } catch(error) {
    res.status(500).json({error:'ไม่สามารถตรวจสอบบัญชีได้'});
  }
});

app.post('/api/auth/register', async (req,res)=>{
  const {email,password,displayName,phone}=req.body;
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
    || normalizedEmail.length > 190
    || typeof password!=='string'
    || password.length<8
    || typeof displayName!=='string'
    || !displayName.trim()
    || displayName.trim().length > 100){
    return res.status(400).json({error:'ข้อมูลสมัครสมาชิกไม่ถูกต้อง'});
  }
  try {
    const passwordHash=await bcrypt.hash(password,12);
    const [result]=await pool.execute(
      'INSERT INTO users (email, password_hash, display_name, phone) VALUES (?, ?, ?, ?)',
      [normalizedEmail,passwordHash,displayName.trim(),typeof phone === 'string' ? phone.slice(0,20) : null]
    );
    const user = { id: result.insertId, email: normalizedEmail, display_name: displayName.trim(), role:'customer' };
    setSessionCookie(res, user.id);
    res.status(201).json({user});
  } catch(error){
    if(error.code==='ER_DUP_ENTRY') return res.status(409).json({error:'อีเมลนี้ถูกใช้งานแล้ว'});
    res.status(500).json({error:'ไม่สามารถสมัครสมาชิกได้'});
  }
});

app.post('/api/auth/login', async (req,res)=>{
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = req.body.password;
  if(!email || typeof password !== 'string') {
    return res.status(400).json({error:'กรุณากรอกอีเมลและรหัสผ่าน'});
  }
  try {
    const [rows] = await pool.execute(
      'SELECT id, email, display_name, role, password_hash FROM users WHERE email = ?',
      [email]
    );
    if(!rows[0] || !(await bcrypt.compare(password, rows[0].password_hash))) {
      return res.status(401).json({error:'อีเมลหรือรหัสผ่านไม่ถูกต้อง'});
    }
    const user = { id: rows[0].id, email: rows[0].email, display_name: rows[0].display_name, role:rows[0].role };
    setSessionCookie(res, user.id);
    res.json({user});
  } catch(error) {
    res.status(500).json({error:'ไม่สามารถเข้าสู่ระบบได้'});
  }
});

app.post('/api/auth/logout', (_req,res)=>{
  res.clearCookie(sessionCookie, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/'
  });
  res.json({status:'ok'});
});

app.get('/api/orders', async (req,res)=>{
  try {
    const user = await getCurrentUser(req);
    if(!user) return res.status(401).json({error:'กรุณาเข้าสู่ระบบก่อน'});
    const [rows] = await pool.execute(
      `SELECT order_number, status, subtotal, discount, total, shipping_address, created_at
       FROM orders WHERE user_id = ? AND status = 'demo' ORDER BY created_at DESC LIMIT 50`,
      [user.id]
    );
    res.json({orders:rows.map(order=>{
      const snapshot=typeof order.shipping_address==='string'
        ? JSON.parse(order.shipping_address)
        : order.shipping_address;
      return {
        orderNumber:order.order_number,
        status:order.status,
        subtotal:Number(order.subtotal),
        discount:Number(order.discount),
        total:Number(order.total),
        voucherCode:snapshot.voucherCode||null,
        items:snapshot.items,
        createdAt:order.created_at
      };
    })});
  } catch(error) {
    res.status(500).json({error:'ไม่สามารถโหลดประวัติคำสั่งซื้อได้'});
  }
});

app.post('/api/orders', async (req,res)=>{
  const items = req.body.items;
  if(!Array.isArray(items) || items.length === 0 || items.length > 100) {
    return res.status(400).json({error:'ตะกร้าสินค้าไม่ถูกต้อง'});
  }
  if(req.body.voucherCode!=null&&typeof req.body.voucherCode!=='string') {
    return res.status(400).json({error:'รหัสคูปองไม่ถูกต้อง'});
  }
  const voucherCode=typeof req.body.voucherCode==='string'?req.body.voucherCode.trim().toUpperCase():'';
  if(req.body.voucherCode!=null&&voucherCode&&!/^[A-Z0-9_-]{3,50}$/.test(voucherCode)) {
    return res.status(400).json({error:'รหัสคูปองไม่ถูกต้อง'});
  }
  for(const item of items) {
    if(!item || typeof item.sku !== 'string' || !item.sku.trim() || item.sku.length>100
      || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 99) {
      return res.status(400).json({error:'มีสินค้าในตะกร้าที่ไม่ถูกต้อง'});
    }
  }

  let connection;
  try {
    const user = await getCurrentUser(req);
    if(!user) return res.status(401).json({error:'กรุณาเข้าสู่ระบบก่อน'});
    connection=await pool.getConnection();
    await connection.beginTransaction();
    const normalizedItems=[];
    for(const item of items) {
      const [products]=await connection.execute(
        'SELECT sku,name,price FROM products WHERE sku=? AND active=TRUE',[item.sku.trim()]
      );
      if(!products.length) {
        await connection.rollback();
        return res.status(400).json({error:`ไม่พบสินค้าที่เปิดขาย: ${item.sku}`});
      }
      normalizedItems.push({
        sku:products[0].sku,
        name:products[0].name,
        quantity:item.quantity,
        price:Number(products[0].price)
      });
    }
    const subtotal=Math.round(normalizedItems.reduce((sum,item)=>sum+item.price*item.quantity,0)*100)/100;
    if(!Number.isFinite(subtotal)||subtotal>100000000) {
      await connection.rollback();
      return res.status(400).json({error:'ยอดรวมคำสั่งซื้อไม่ถูกต้อง'});
    }

    let discount=0;
    let claimedVoucherId=null;
    if(voucherCode) {
      const [vouchers]=await connection.execute(
        `SELECT id,code,discount_type,discount_value,minimum_order,usage_limit
         FROM vouchers WHERE code=? AND active=TRUE
         AND (starts_at IS NULL OR starts_at<=NOW())
         AND (ends_at IS NULL OR ends_at>NOW()) FOR UPDATE`,
        [voucherCode]
      );
      if(!vouchers.length) {
        await connection.rollback();
        return res.status(400).json({error:'คูปองไม่มีอยู่ หมดอายุ หรือปิดใช้งานแล้ว'});
      }
      const voucher=vouchers[0];
      claimedVoucherId=voucher.id;
      const [claims]=await connection.execute(
        'SELECT used_at FROM user_vouchers WHERE user_id=? AND voucher_id=? FOR UPDATE',
        [user.id,voucher.id]
      );
      if(!claims.length) {
        await connection.rollback();
        return res.status(400).json({error:'กรุณาเก็บคูปองนี้จากหน้าโปรโมชันก่อน'});
      }
      if(claims[0].used_at) {
        await connection.rollback();
        return res.status(409).json({error:'คูปองนี้ถูกใช้ไปแล้ว'});
      }
      if(subtotal<Number(voucher.minimum_order)) {
        await connection.rollback();
        return res.status(400).json({error:`ยอดสั่งซื้อไม่ถึงขั้นต่ำ ${Number(voucher.minimum_order).toLocaleString('th-TH')} บาท`});
      }
      const [[usage]]=await connection.execute(
        'SELECT COUNT(*) AS used_count FROM user_vouchers WHERE voucher_id=? AND used_at IS NOT NULL',
        [voucher.id]
      );
      if(voucher.usage_limit!=null&&Number(usage.used_count)>=Number(voucher.usage_limit)) {
        await connection.rollback();
        return res.status(409).json({error:'สิทธิ์คูปองนี้ถูกใช้ครบแล้ว'});
      }
      if(voucher.discount_type==='fixed') {
        discount=Math.min(subtotal,Number(voucher.discount_value));
      } else if(voucher.discount_type==='percent') {
        discount=Math.min(subtotal,subtotal*Number(voucher.discount_value)/100);
      }
      discount=Math.round(discount*100)/100;
    }
    const total=Math.round((subtotal-discount)*100)/100;
    const orderNumber = `NX${new Date().toISOString().slice(2,10).replaceAll('-','')}${randomBytes(3).toString('hex').toUpperCase()}`;
    const demoData=JSON.stringify({demoOnly:true,items:normalizedItems,voucherCode:voucherCode||null,discount});
    await connection.execute(
      `INSERT INTO orders (order_number, user_id, status, subtotal, shipping_fee, discount, total, payment_method, shipping_address)
       VALUES (?, ?, 'demo', ?, 0, ?, ?, 'demo', ?)`,
      [orderNumber,user.id,subtotal,discount,total,demoData]
    );
    if(voucherCode) {
      await connection.execute(
        'UPDATE user_vouchers SET used_at=NOW() WHERE user_id=? AND voucher_id=? AND used_at IS NULL',
        [user.id,claimedVoucherId]
      );
    }
    await connection.commit();
    res.status(201).json({
      order:{
        orderNumber,
        status:'demo',
        subtotal,
        discount,
        total,
        voucherCode:voucherCode||null,
        items:normalizedItems,
        createdAt:new Date().toISOString()
      }
    });
  } catch(error) {
    if(connection) await connection.rollback();
    console.error('Demo order save failed:',error);
    res.status(500).json({error:'ไม่สามารถบันทึกคำสั่งซื้อทดลองได้'});
  } finally {
    connection?.release();
  }
});

const parseJson = (value,fallback) => {
  if(value == null) return fallback;
  return typeof value === 'string' ? JSON.parse(value) : value;
};

const mapProduct = row => {
  const index = (Number(row.id) - 1) % 10;
  return {
    id:Number(row.id),
    sku:row.sku,
    category:row.category_name,
    name:row.name,
    brand:row.brand_name,
    price:Number(row.price),
    oldPrice:row.old_price == null ? null : Number(row.old_price),
    rank:row.product_rank,
    image:row.image_url,
    stats:{speed:65+index*3,precision:72+index*2,durability:68+index*2,value:74+index},
    pros:parseJson(row.pros,['คุณภาพระดับพรีเมียม']),
    cons:parseJson(row.cons,[]),
    active:Boolean(row.active),
    stock:Number(row.stock || 0)
  };
};

const productQuery = `
  SELECT p.id,p.sku,p.name,p.price,p.old_price,p.\`rank\` AS product_rank,
         p.image_url,p.pros,p.cons,p.active,c.name AS category_name,b.name AS brand_name,
         COALESCE(inventory.stock,0) AS stock
  FROM products p
  JOIN categories c ON c.id=p.category_id
  JOIN brands b ON b.id=p.brand_id
  LEFT JOIN (
    SELECT product_id,SUM(stock) AS stock
    FROM product_variants GROUP BY product_id
  ) inventory ON inventory.product_id=p.id
`;

const slugify = (value,prefix) => {
  const readable=value.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,75);
  const suffix=createHash('sha256').update(value.toLowerCase()).digest('hex').slice(0,10);
  return `${prefix}-${readable||'item'}-${suffix}`;
};

const validateProduct = body => {
  const price=Number(body.price);
  const oldPrice=body.oldPrice === '' || body.oldPrice == null ? null : Number(body.oldPrice);
  const stock=Number(body.stock);
  if(typeof body.sku!=='string'||! /^[a-zA-Z0-9._-]{3,100}$/.test(body.sku.trim())
    || typeof body.name!=='string'||!body.name.trim()||body.name.trim().length>200
    || typeof body.category!=='string'||!body.category.trim()||body.category.trim().length>100
    || typeof body.brand!=='string'||!body.brand.trim()||body.brand.trim().length>100
    || !Number.isFinite(price)||price<=0||price>10000000
    || (oldPrice!==null&&(!Number.isFinite(oldPrice)||oldPrice<=0||oldPrice>10000000))
    || !['S','A','B','C'].includes(body.rank)
    || typeof body.image!=='string'||(!body.image.startsWith('/products/')&&!/^https:\/\//i.test(body.image))
    || !Number.isSafeInteger(stock)||stock<0||stock>1000000
    || typeof body.active!=='boolean') return null;
  return {
    sku:body.sku.trim().toUpperCase(),
    name:body.name.trim(),
    category:body.category.trim(),
    brand:body.brand.trim(),
    price,
    oldPrice,
    rank:body.rank,
    image:body.image.trim(),
    stock,
    active:body.active
  };
};

const ensureLookup = async (connection,table,name,prefix) => {
  const slug=slugify(name,prefix);
  await connection.execute(
    `INSERT IGNORE INTO ${table} (name,slug) VALUES (?,?)`,
    [name,slug]
  );
  const [rows]=await connection.execute(`SELECT id FROM ${table} WHERE name=?`,[name]);
  if(!rows.length) throw new Error(`Unable to resolve ${table} entry`);
  return rows[0].id;
};

const saveProduct = async (req,res,productId=null) => {
  const product=validateProduct(req.body);
  if(!product) return res.status(400).json({error:'ข้อมูลสินค้าไม่ถูกต้อง'});
  const connection=await pool.getConnection();
  try {
    await connection.beginTransaction();
    const categoryId=await ensureLookup(connection,'categories',product.category,'category');
    const brandId=await ensureLookup(connection,'brands',product.brand,'brand');
    let id=productId;
    if(productId) {
      const [existing]=await connection.execute('SELECT id FROM products WHERE id=?',[productId]);
      if(!existing.length) {
        await connection.rollback();
        return res.status(404).json({error:'ไม่พบสินค้า'});
      }
      await connection.execute(
        `UPDATE products SET category_id=?,brand_id=?,sku=?,name=?,price=?,old_price=?,
         \`rank\`=?,image_url=?,active=? WHERE id=?`,
        [categoryId,brandId,product.sku,product.name,product.price,product.oldPrice,
          product.rank,product.image,product.active,productId]
      );
    } else {
      const [result]=await connection.execute(
        `INSERT INTO products
         (category_id,brand_id,sku,name,price,old_price,\`rank\`,image_url,active)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [categoryId,brandId,product.sku,product.name,product.price,product.oldPrice,
          product.rank,product.image,product.active]
      );
      id=result.insertId;
    }

    const [variants]=await connection.execute(
      'SELECT id FROM product_variants WHERE product_id=? ORDER BY id',[id]
    );
    if(variants.length) {
      await connection.execute('UPDATE product_variants SET stock=0 WHERE product_id=?',[id]);
      await connection.execute('UPDATE product_variants SET stock=? WHERE id=?',[product.stock,variants[0].id]);
    } else {
      await connection.execute(
        'INSERT INTO product_variants (product_id,name,stock) VALUES (?,\'Default\',?)',
        [id,product.stock]
      );
    }
    await writeAdminLog(connection,req,productId?'update':'create','product',id,{
      sku:product.sku,name:product.name
    });
    await connection.commit();
    res.status(productId?200:201).json({product:{id:Number(id),...product}});
  } catch(error) {
    await connection.rollback();
    if(error.code==='ER_DUP_ENTRY') return res.status(409).json({error:'รหัส SKU นี้ถูกใช้แล้ว'});
    console.error('Admin product save failed:',error);
    res.status(500).json({error:'บันทึกสินค้าไม่สำเร็จ'});
  } finally {
    connection.release();
  }
};

app.get('/api/admin/summary',requireRoles('super_admin','order_staff','marketing'),async (_req,res)=>{
  try {
    const [[summary]]=await pool.query(
      `SELECT
        (SELECT COUNT(*) FROM products WHERE active=TRUE) AS activeProducts,
        (SELECT COUNT(*) FROM users WHERE role='customer') AS customers,
        (SELECT COUNT(*) FROM orders WHERE status='demo') AS demoOrders,
        (SELECT COALESCE(SUM(total),0) FROM orders WHERE status='demo') AS demoTotal,
        (SELECT COUNT(*) FROM vouchers WHERE active=TRUE) AS activeVouchers`
    );
    res.json({
      activeProducts:Number(summary.activeProducts),
      customers:Number(summary.customers),
      demoOrders:Number(summary.demoOrders),
      demoTotal:Number(summary.demoTotal),
      activeVouchers:Number(summary.activeVouchers)
    });
  } catch(error) {
    res.status(500).json({error:'โหลดข้อมูลแดชบอร์ดไม่สำเร็จ'});
  }
});

app.get('/api/admin/orders',requireRoles('super_admin','order_staff'),async (req,res)=>{
  const search=typeof req.query.search==='string'?escapeLike(req.query.search).slice(0,100):'';
  try {
    const [rows]=await pool.execute(
      `SELECT o.order_number,o.total,o.discount,o.shipping_address,o.created_at,u.email,u.display_name
       FROM orders o LEFT JOIN users u ON u.id=o.user_id
       WHERE o.status='demo' AND (?='' OR o.order_number LIKE ? ESCAPE '\\\\' OR u.email LIKE ? ESCAPE '\\\\')
       ORDER BY o.created_at DESC LIMIT 100`,
      [search,`%${search}%`,`%${search}%`]
    );
    res.json({orders:rows.map(order=>{
      const snapshot=parseJson(order.shipping_address,{});
      return {
        orderNumber:order.order_number,
        customer:order.display_name||order.email||'บัญชีที่ถูกลบ',
        email:order.email,
        total:Number(order.total),
        discount:Number(order.discount),
        voucherCode:snapshot.voucherCode||null,
        items:snapshot.items||[],
        createdAt:order.created_at,
        demoOnly:true
      };
    })});
  } catch(error) {
    res.status(500).json({error:'โหลดคำสั่งซื้อทดลองไม่สำเร็จ'});
  }
});

app.get('/api/admin/products',requireRoles('super_admin'),async (_req,res)=>{
  try {
    const [rows]=await pool.query(`${productQuery} ORDER BY p.id DESC LIMIT 500`);
    res.json({products:rows.map(mapProduct)});
  } catch(error) {
    res.status(500).json({error:'โหลดสินค้าไม่สำเร็จ'});
  }
});

app.get('/api/admin/meta',requireRoles('super_admin'),async (_req,res)=>{
  try {
    const [categories]=await pool.query('SELECT name FROM categories ORDER BY name');
    const [brands]=await pool.query('SELECT name FROM brands ORDER BY name');
    res.json({categories:categories.map(row=>row.name),brands:brands.map(row=>row.name)});
  } catch(error) {
    res.status(500).json({error:'โหลดหมวดหมู่และแบรนด์ไม่สำเร็จ'});
  }
});

app.post('/api/admin/products',requireRoles('super_admin'),(req,res)=>saveProduct(req,res));
app.put('/api/admin/products/:id',requireRoles('super_admin'),(req,res)=>{
  const id=Number(req.params.id);
  if(!Number.isSafeInteger(id)||id<1) return res.status(400).json({error:'รหัสสินค้าไม่ถูกต้อง'});
  return saveProduct(req,res,id);
});
app.delete('/api/admin/products/:id',requireRoles('super_admin'),async (req,res)=>{
  const id=Number(req.params.id);
  if(!Number.isSafeInteger(id)||id<1) return res.status(400).json({error:'รหัสสินค้าไม่ถูกต้อง'});
  const connection=await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [result]=await connection.execute('UPDATE products SET active=FALSE WHERE id=?',[id]);
    if(!result.affectedRows) {
      await connection.rollback();
      return res.status(404).json({error:'ไม่พบสินค้า'});
    }
    await writeAdminLog(connection,req,'deactivate','product',id,{});
    await connection.commit();
    res.json({status:'ok'});
  } catch(error) {
    await connection.rollback();
    res.status(500).json({error:'ซ่อนสินค้าไม่สำเร็จ'});
  } finally {
    connection.release();
  }
});

app.get('/api/admin/customers',requireRoles('super_admin'),async (_req,res)=>{
  try {
    const [rows]=await pool.query(
      `SELECT id,email,display_name,phone,role,created_at
       FROM users ORDER BY created_at DESC LIMIT 200`
    );
    res.json({customers:rows.map(user=>({...user,id:Number(user.id)}))});
  } catch(error) {
    res.status(500).json({error:'โหลดรายชื่อลูกค้าไม่สำเร็จ'});
  }
});

app.patch('/api/admin/customers/:id/role',requireRoles('super_admin'),async (req,res)=>{
  const id=Number(req.params.id);
  const {role}=req.body;
  if(!Number.isSafeInteger(id)||id<1||!['customer','order_staff','marketing'].includes(role)) {
    return res.status(400).json({error:'ข้อมูลสิทธิ์ไม่ถูกต้อง'});
  }
  if(String(id)===String(req.adminUser.id)) return res.status(400).json({error:'ไม่สามารถเปลี่ยนสิทธิ์บัญชีที่กำลังใช้งานได้'});
  const connection=await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows]=await connection.execute('SELECT role FROM users WHERE id=? FOR UPDATE',[id]);
    if(!rows.length) {
      await connection.rollback();
      return res.status(404).json({error:'ไม่พบบัญชีนี้'});
    }
    if(rows[0].role==='super_admin') {
      await connection.rollback();
      return res.status(403).json({error:'เปลี่ยนสิทธิ์ super_admin ผ่านหน้าระบบไม่ได้'});
    }
    await connection.execute('UPDATE users SET role=? WHERE id=?',[role,id]);
    await writeAdminLog(connection,req,'change_role','user',id,{from:rows[0].role,to:role});
    await connection.commit();
    res.json({status:'ok',role});
  } catch(error) {
    await connection.rollback();
    res.status(500).json({error:'เปลี่ยนสิทธิ์บัญชีไม่สำเร็จ'});
  } finally {
    connection.release();
  }
});

app.get('/api/admin/reports',requireRoles('super_admin','marketing'),async (_req,res)=>{
  try {
    const [days]=await pool.query(
      `SELECT DATE(created_at) AS date,COUNT(*) AS orderCount,COALESCE(SUM(total),0) AS total
       FROM orders WHERE status='demo' AND created_at>=DATE_SUB(CURDATE(),INTERVAL 29 DAY)
       GROUP BY DATE(created_at) ORDER BY DATE(created_at)`
    );
    res.json({label:'รายงานคำสั่งซื้อทดลอง (ไม่มีรายได้จริง)',days:days.map(row=>({
      date:row.date,
      orderCount:Number(row.orderCount),
      total:Number(row.total)
    }))});
  } catch(error) {
    res.status(500).json({error:'โหลดรายงานไม่สำเร็จ'});
  }
});

const validateVoucher = body => {
  const discountValue=Number(body.discountValue);
  const minimumOrder=Number(body.minimumOrder ?? 0);
  const usageLimit=body.usageLimit === '' || body.usageLimit == null ? null : Number(body.usageLimit);
  const parseDate=value=>{
    if(!value) return null;
    const date=new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString().slice(0,19).replace('T',' ');
  };
  const startsAt=parseDate(body.startsAt);
  const endsAt=parseDate(body.endsAt);
  if(typeof body.code!=='string'||! /^[A-Z0-9_-]{3,50}$/.test(body.code.trim().toUpperCase())
    || !['fixed','percent','free_shipping'].includes(body.discountType)
    || !Number.isFinite(discountValue)||discountValue<0||discountValue>10000000
    || (body.discountType==='percent'&&discountValue>100)
    || !Number.isFinite(minimumOrder)||minimumOrder<0||minimumOrder>100000000
    || (usageLimit!==null&&(!Number.isSafeInteger(usageLimit)||usageLimit<1||usageLimit>10000000))
    || startsAt===undefined||endsAt===undefined
    || (startsAt&&endsAt&&startsAt>=endsAt)
    || typeof body.active!=='boolean') return null;
  return {
    code:body.code.trim().toUpperCase(),
    discountType:body.discountType,
    discountValue,
    minimumOrder,
    usageLimit,
    startsAt,
    endsAt,
    active:body.active
  };
};

const saveVoucher = async (req,res,voucherId=null) => {
  const voucher=validateVoucher(req.body);
  if(!voucher) return res.status(400).json({error:'ข้อมูลโปรโมชันไม่ถูกต้อง'});
  const connection=await pool.getConnection();
  try {
    await connection.beginTransaction();
    let id=voucherId;
    if(voucherId) {
      const [existing]=await connection.execute('SELECT id FROM vouchers WHERE id=?',[voucherId]);
      if(!existing.length) {
        await connection.rollback();
        return res.status(404).json({error:'ไม่พบโปรโมชัน'});
      }
      await connection.execute(
        `UPDATE vouchers SET code=?,discount_type=?,discount_value=?,minimum_order=?,
         usage_limit=?,starts_at=?,ends_at=?,active=? WHERE id=?`,
        [voucher.code,voucher.discountType,voucher.discountValue,voucher.minimumOrder,
          voucher.usageLimit,voucher.startsAt,voucher.endsAt,voucher.active,voucherId]
      );
    } else {
      const [result]=await connection.execute(
        `INSERT INTO vouchers
         (code,discount_type,discount_value,minimum_order,usage_limit,starts_at,ends_at,active)
         VALUES (?,?,?,?,?,?,?,?)`,
        [voucher.code,voucher.discountType,voucher.discountValue,voucher.minimumOrder,
          voucher.usageLimit,voucher.startsAt,voucher.endsAt,voucher.active]
      );
      id=result.insertId;
    }
    await writeAdminLog(connection,req,voucherId?'update':'create','voucher',id,{code:voucher.code});
    await connection.commit();
    res.status(voucherId?200:201).json({voucher:{id:Number(id),...voucher}});
  } catch(error) {
    await connection.rollback();
    if(error.code==='ER_DUP_ENTRY') return res.status(409).json({error:'รหัสคูปองนี้มีแล้ว'});
    res.status(500).json({error:'บันทึกโปรโมชันไม่สำเร็จ'});
  } finally {
    connection.release();
  }
};

app.get('/api/admin/promotions',requireRoles('super_admin','marketing'),async (_req,res)=>{
  try {
    const [rows]=await pool.query(
      `      SELECT v.id,v.code,v.discount_type,v.discount_value,v.minimum_order,v.usage_limit,
             v.starts_at,v.ends_at,v.active,COUNT(uv.used_at) AS used_count
      FROM vouchers v LEFT JOIN user_vouchers uv ON uv.voucher_id=v.id
      GROUP BY v.id ORDER BY v.id DESC LIMIT 200`
    );
    res.json({promotions:rows.map(row=>({
      id:Number(row.id),
      code:row.code,
      discountType:row.discount_type,
      discountValue:Number(row.discount_value),
      minimumOrder:Number(row.minimum_order),
      usageLimit:row.usage_limit==null?null:Number(row.usage_limit),
      usedCount:Number(row.used_count),
      startsAt:row.starts_at,
      endsAt:row.ends_at,
      active:Boolean(row.active)
    }))});
  } catch(error) {
    res.status(500).json({error:'โหลดโปรโมชันไม่สำเร็จ'});
  }
});

app.post('/api/admin/promotions',requireRoles('super_admin','marketing'),(req,res)=>saveVoucher(req,res));
app.put('/api/admin/promotions/:id',requireRoles('super_admin','marketing'),(req,res)=>{
  const id=Number(req.params.id);
  if(!Number.isSafeInteger(id)||id<1) return res.status(400).json({error:'รหัสโปรโมชันไม่ถูกต้อง'});
  return saveVoucher(req,res,id);
});
app.delete('/api/admin/promotions/:id',requireRoles('super_admin','marketing'),async (req,res)=>{
  const id=Number(req.params.id);
  if(!Number.isSafeInteger(id)||id<1) return res.status(400).json({error:'รหัสโปรโมชันไม่ถูกต้อง'});
  const connection=await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [result]=await connection.execute('UPDATE vouchers SET active=FALSE WHERE id=?',[id]);
    if(!result.affectedRows) {
      await connection.rollback();
      return res.status(404).json({error:'ไม่พบโปรโมชัน'});
    }
    await writeAdminLog(connection,req,'deactivate','voucher',id,{});
    await connection.commit();
    res.json({status:'ok'});
  } catch(error) {
    await connection.rollback();
    res.status(500).json({error:'ปิดโปรโมชันไม่สำเร็จ'});
  } finally {
    connection.release();
  }
});

app.get('/api/admin/logs',requireRoles('super_admin'),async (_req,res)=>{
  try {
    const [rows]=await pool.query(
      `SELECT l.id,l.action,l.entity_type,l.entity_id,l.details,l.created_at,u.email
       FROM admin_logs l LEFT JOIN users u ON u.id=l.admin_id
       ORDER BY l.created_at DESC LIMIT 100`
    );
    res.json({logs:rows.map(row=>({
      id:Number(row.id),
      action:row.action,
      entityType:row.entity_type,
      entityId:row.entity_id,
      details:parseJson(row.details,{}),
      createdAt:row.created_at,
      adminEmail:row.email||'บัญชีที่ถูกลบ'
    }))});
  } catch(error) {
    res.status(500).json({error:'โหลดบันทึกการทำงานไม่สำเร็จ'});
  }
});

app.get('/api/vouchers',async (_req,res)=>{
  try {
    const [rows]=await pool.query(
      `SELECT id,code,discount_type,discount_value,minimum_order,ends_at
       FROM vouchers WHERE active=TRUE AND (starts_at IS NULL OR starts_at<=NOW())
       AND (ends_at IS NULL OR ends_at>NOW()) ORDER BY id DESC`
    );
    res.json({vouchers:rows.map(row=>({
      id:Number(row.id),
      code:row.code,
      discountType:row.discount_type,
      discountValue:Number(row.discount_value),
      minimumOrder:Number(row.minimum_order),
      endsAt:row.ends_at
    }))});
  } catch(error) {
    res.status(500).json({error:'โหลดคูปองไม่สำเร็จ'});
  }
});

app.get('/api/vouchers/mine',async (req,res)=>{
  try {
    const user=await getCurrentUser(req);
    if(!user) return res.status(401).json({error:'กรุณาเข้าสู่ระบบก่อน'});
    const [rows]=await pool.execute(
      `SELECT uv.voucher_id,uv.used_at FROM user_vouchers uv
       JOIN vouchers v ON v.id=uv.voucher_id
       WHERE uv.user_id=? AND v.active=TRUE`,
      [user.id]
    );
    res.json({vouchers:rows.map(row=>({id:Number(row.voucher_id),used:Boolean(row.used_at)}))});
  } catch(error) {
    res.status(500).json({error:'โหลดคูปองของคุณไม่สำเร็จ'});
  }
});

app.post('/api/vouchers/:id/claim',async (req,res)=>{
  const id=Number(req.params.id);
  if(!Number.isSafeInteger(id)||id<1) return res.status(400).json({error:'รหัสคูปองไม่ถูกต้อง'});
  let connection;
  try {
    const user=await getCurrentUser(req);
    if(!user) return res.status(401).json({error:'กรุณาเข้าสู่ระบบก่อน'});
    connection=await pool.getConnection();
    await connection.beginTransaction();
    const [vouchers]=await connection.execute(
      `SELECT id,usage_limit FROM vouchers WHERE id=? AND active=TRUE
       AND (starts_at IS NULL OR starts_at<=NOW())
       AND (ends_at IS NULL OR ends_at>NOW()) FOR UPDATE`,
      [id]
    );
    if(!vouchers.length) {
      await connection.rollback();
      return res.status(404).json({error:'คูปองนี้ไม่มีอยู่หรือไม่เปิดใช้งาน'});
    }
    const [existing]=await connection.execute(
      'SELECT id FROM user_vouchers WHERE user_id=? AND voucher_id=?',
      [user.id,id]
    );
    if(existing.length) {
      await connection.rollback();
      return res.status(409).json({error:'คุณเก็บคูปองนี้แล้ว'});
    }
    const [[usage]]=await connection.execute(
      'SELECT COUNT(*) AS used_count FROM user_vouchers WHERE voucher_id=? AND used_at IS NOT NULL',
      [id]
    );
    if(vouchers[0].usage_limit!=null&&Number(usage.used_count)>=Number(vouchers[0].usage_limit)) {
      await connection.rollback();
      return res.status(409).json({error:'สิทธิ์คูปองนี้ถูกใช้ครบแล้ว'});
    }
    await connection.execute('INSERT INTO user_vouchers (user_id,voucher_id) VALUES (?,?)',[user.id,id]);
    await connection.commit();
    res.status(201).json({status:'claimed',voucherId:id});
  } catch(error) {
    if(connection) await connection.rollback();
    if(error.code==='ER_DUP_ENTRY') return res.status(409).json({error:'คุณเก็บคูปองนี้แล้ว'});
    console.error('Voucher claim failed:',error);
    res.status(500).json({error:'เก็บคูปองไม่สำเร็จ'});
  } finally {
    connection?.release();
  }
});

app.get('/api/products', async (req,res)=>{
  const search=typeof req.query.search==='string'?escapeLike(req.query.search).slice(0,100):'';
  const limit=Math.min(Math.max(Number(req.query.limit)||200,1),500);
  try {
    const [rows]=search
      ? await pool.execute(`${productQuery}
          WHERE p.active=TRUE AND (p.name LIKE ? ESCAPE '\\\\' OR p.sku LIKE ? ESCAPE '\\\\')
          ORDER BY p.id LIMIT ${limit}`,[`%${search}%`,`%${search}%`])
      : await pool.execute(`${productQuery} WHERE p.active=TRUE ORDER BY p.id LIMIT ${limit}`);
    res.json({products:rows.map(mapProduct)});
  } catch(error){ res.status(500).json({error:'ไม่สามารถโหลดสินค้าได้'}); }
});

app.post('/api/arcade/log', async (req,res)=>{
  const gameType=String(req.body.gameType||'').slice(0,50);
  const score=Math.min(Math.max(Number(req.body.score)||0,0),2147483647);
  const reward=String(req.body.reward||'').slice(0,100);
  if(!gameType)return res.status(400).json({error:'กรุณาระบุประเภทเกม'});
  try {
    await pool.execute('INSERT INTO arcade_logs (game_type, score, reward, ip_hash) VALUES (?, ?, ?, ?)',[
      gameType,score,reward,Buffer.from(req.ip||'').toString('base64').slice(0,64)
    ]);
    res.status(201).json({status:'logged'});
  } catch(error){ res.status(500).json({error:'บันทึกผลไม่สำเร็จ'}); }
});

app.use((_req,res)=>res.status(404).json({error:'Not found'}));

app.listen(port,()=>console.log(`Nexora API listening on port ${port}`));
