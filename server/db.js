import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';

const DB_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const DB_PATH = path.join(DB_DIR, 'modish7.db');
const db = new DatabaseSync(DB_PATH);

// Enable foreign keys and WAL mode for reliability
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA journal_mode = WAL;');

/**
 * Initialize Database Tables
 */
export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS salons (
      id TEXT PRIMARY KEY,
      full_name TEXT NOT NULL,
      business_name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      phone TEXT NOT NULL,
      city TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      business_address TEXT DEFAULT '',
      state TEXT DEFAULT '',
      gstin TEXT DEFAULT '',
      billing_address TEXT DEFAULT '',
      is_verified INTEGER DEFAULT 1,
      reset_token TEXT DEFAULT NULL,
      reset_token_expires INTEGER DEFAULT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      sku TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      size TEXT NOT NULL,
      image_url TEXT NOT NULL,
      reference_offer_price INTEGER NOT NULL,
      mrp INTEGER NOT NULL,
      description TEXT NOT NULL,
      in_stock INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      salon_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
      reference_total_amount INTEGER NOT NULL,
      approved_payable_amount INTEGER DEFAULT NULL,
      notes TEXT DEFAULT '',
      quotation_ref TEXT DEFAULT NULL,
      quotation_approved_at TEXT DEFAULT NULL,
      quotation_expires_at TEXT DEFAULT NULL,
      razorpay_order_id TEXT DEFAULT NULL,
      razorpay_payment_id TEXT DEFAULT NULL,
      paid_at TEXT DEFAULT NULL,
      invoice_id TEXT DEFAULT NULL,
      tracking_number TEXT DEFAULT NULL,
      delivery_status TEXT DEFAULT 'PENDING_REVIEW',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (salon_id) REFERENCES salons(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      product_name TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit_reference_price INTEGER NOT NULL,
      subtotal INTEGER NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS payment_transactions (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      salon_id TEXT NOT NULL,
      amount INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'INR',
      gateway TEXT NOT NULL DEFAULT 'RAZORPAY',
      razorpay_order_id TEXT NOT NULL,
      razorpay_payment_id TEXT DEFAULT NULL,
      razorpay_signature TEXT DEFAULT NULL,
      status TEXT NOT NULL,
      idempotency_key TEXT UNIQUE,
      created_at TEXT NOT NULL,
      verified_at TEXT DEFAULT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (salon_id) REFERENCES salons(id)
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      order_id TEXT UNIQUE NOT NULL,
      salon_id TEXT NOT NULL,
      invoice_number TEXT UNIQUE NOT NULL,
      amount_taxable INTEGER NOT NULL,
      cgst_amount INTEGER NOT NULL,
      sgst_amount INTEGER NOT NULL,
      total_amount INTEGER NOT NULL,
      issued_at TEXT NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (salon_id) REFERENCES salons(id)
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      action TEXT NOT NULL,
      details TEXT,
      created_at TEXT NOT NULL
    );
  `);

  // Safe idempotent column additions for Google OAuth, customer profile, and e-commerce shipping
  try { db.exec("ALTER TABLE salons ADD COLUMN auth_provider TEXT DEFAULT 'email';"); } catch {}
  try { db.exec("ALTER TABLE salons ADD COLUMN google_id TEXT DEFAULT NULL;"); } catch {}
  try { db.exec("ALTER TABLE salons ADD COLUMN avatar_url TEXT DEFAULT '';"); } catch {}
  try { db.exec("ALTER TABLE salons ADD COLUMN pincode TEXT DEFAULT '';"); } catch {}

  // Safe idempotent column additions for direct e-commerce checkout on orders
  try { db.exec("ALTER TABLE orders ADD COLUMN shipping_name TEXT DEFAULT '';"); } catch {}
  try { db.exec("ALTER TABLE orders ADD COLUMN shipping_phone TEXT DEFAULT '';"); } catch {}
  try { db.exec("ALTER TABLE orders ADD COLUMN shipping_business_name TEXT DEFAULT '';"); } catch {}
  try { db.exec("ALTER TABLE orders ADD COLUMN shipping_address TEXT DEFAULT '';"); } catch {}
  try { db.exec("ALTER TABLE orders ADD COLUMN shipping_city TEXT DEFAULT '';"); } catch {}
  try { db.exec("ALTER TABLE orders ADD COLUMN shipping_state TEXT DEFAULT '';"); } catch {}
  try { db.exec("ALTER TABLE orders ADD COLUMN shipping_pincode TEXT DEFAULT '';"); } catch {}
  try { db.exec("ALTER TABLE orders ADD COLUMN subtotal_amount INTEGER DEFAULT 0;"); } catch {}
  try { db.exec("ALTER TABLE orders ADD COLUMN discount_amount INTEGER DEFAULT 0;"); } catch {}
  try { db.exec("ALTER TABLE orders ADD COLUMN shipping_fee INTEGER DEFAULT 0;"); } catch {}
  try { db.exec("ALTER TABLE orders ADD COLUMN gift_item TEXT DEFAULT '';"); } catch {}
  try { db.exec("ALTER TABLE orders ADD COLUMN order_type TEXT DEFAULT 'DIRECT_ECOMMERCE';"); } catch {}

  seedProducts();
}

/**
 * Seed Official 4 Products with Exact Verified Store Reference Pricing
 */
function seedProducts() {
  const count = db.prepare('SELECT COUNT(*) as count FROM products').get().count;
  if (count === 0) {
    const insert = db.prepare(`
      INSERT INTO products (id, sku, name, category, size, image_url, reference_offer_price, mrp, description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const products = [
      [
        'shea-butter-combo',
        'MOD7-SB-COMBO-01',
        'Shea Butter Shampoo + Conditioner Combo',
        'Professional Backbar & Retail Combo',
        '350ml + 350ml',
        '/assets/modish7/shea-butter-shampoo-conditioner.webp',
        3230,
        3400,
        'Dual-action restructuring formula powered by certified African Shea Butter and Moroccan Argan Oil. Gently purges hard water mineral buildup while delivering deep lipid hydration.'
      ],
      [
        'mks-eco-detangler',
        'MOD7-MKS-DET-02',
        'MKS eco Leave-In & Detangler',
        'Intensive Hair Treatment & Cutting Lotion',
        '118ml',
        '/assets/modish7/mks-eco-leave-in-detangler.webp',
        2089,
        2199,
        'Ultra-lightweight detangling mist enriched with 100% pure Argan and Hemp seed oils. Shields against thermal styling up to 230°C and eliminates cuticle friction.'
      ],
      [
        'shea-butter-conditioner',
        'MOD7-SB-COND-03',
        'Shea Butter Conditioner',
        'Deep Lipid Sealant Conditioner',
        '350ml',
        '/assets/modish7/shea-butter-conditioner.webp',
        1615,
        1700,
        'Concentrated rinse-out conditioning treatment engineered to neutralise hard-water hardness. Infuses bio-compatible lipids and smooths distressed hair fibers.'
      ],
      [
        'anti-dandruff-shampoo',
        'MOD7-AD-SHAMP-04',
        'Anti-Dandruff Shampoo',
        'Scalp Clarifying & Balancing Shampoo',
        '350ml',
        '/assets/modish7/anti-dandruff-shampoo.webp',
        1615,
        1700,
        'Dermatologically balanced clarifying formula targeting flakes, micro-inflammation, and fungal flora while leaving hair touchably soft and moisturized.'
      ]
    ];

    for (const p of products) {
      insert.run(...p);
    }
    console.log('[Database] Seeded 4 official Modish7 salon products.');
  }
}

// Auto-initialize on import
initDatabase();

export default db;
