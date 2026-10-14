-- ==============================================================================
-- MODISH7 — SALON PARTNER PORTAL DATABASE SCHEMA (SUPABASE / POSTGRESQL)
-- Production-Ready Schema with Row Level Security (RLS) & Foreign Key Constraints
-- ==============================================================================

-- 1. SALON PROFILES TABLE
CREATE TABLE IF NOT EXISTS public.salon_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  business_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT NOT NULL,
  city TEXT NOT NULL,
  business_address TEXT DEFAULT '',
  state TEXT DEFAULT '',
  gstin TEXT DEFAULT '',
  billing_address TEXT DEFAULT '',
  is_verified BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.salon_profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies for salon_profiles:
CREATE POLICY "Salon owners can view their own profile"
  ON public.salon_profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Salon owners can update their own profile"
  ON public.salon_profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- 2. PRODUCTS AND PRICING REFERENCES
CREATE TABLE IF NOT EXISTS public.products (
  id TEXT PRIMARY KEY,
  sku TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  size TEXT NOT NULL,
  image_url TEXT NOT NULL,
  reference_offer_price NUMERIC(10, 2) NOT NULL,
  mrp NUMERIC(10, 2) NOT NULL,
  description TEXT NOT NULL,
  in_stock BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can view products
CREATE POLICY "Authenticated salon partners can view products"
  ON public.products FOR SELECT
  TO authenticated
  USING (TRUE);

-- 3. ORDERS TABLE
CREATE TABLE IF NOT EXISTS public.orders (
  id TEXT PRIMARY KEY,
  salon_id UUID NOT NULL REFERENCES public.salon_profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'PENDING_REVIEW' CHECK (status IN ('PENDING_REVIEW', 'QUOTATION_APPROVED', 'PAYMENT_PENDING', 'PAID', 'FULFILLED', 'CANCELLED')),
  reference_total_amount NUMERIC(10, 2) NOT NULL,
  approved_payable_amount NUMERIC(10, 2),
  notes TEXT DEFAULT '',
  quotation_ref TEXT,
  quotation_approved_at TIMESTAMPTZ,
  quotation_expires_at TIMESTAMPTZ,
  razorpay_order_id TEXT,
  razorpay_payment_id TEXT,
  paid_at TIMESTAMPTZ,
  invoice_id TEXT,
  tracking_number TEXT,
  delivery_status TEXT DEFAULT 'PENDING_REVIEW',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Salons can view their own orders"
  ON public.orders FOR SELECT
  USING (auth.uid() = salon_id);

CREATE POLICY "Salons can insert their own orders"
  ON public.orders FOR INSERT
  WITH CHECK (auth.uid() = salon_id);

-- 4. ORDER ITEMS TABLE
CREATE TABLE IF NOT EXISTS public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id TEXT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES public.products(id),
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_reference_price NUMERIC(10, 2) NOT NULL,
  subtotal NUMERIC(10, 2) NOT NULL
);

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Salons can view their own order items"
  ON public.order_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = order_items.order_id
      AND orders.salon_id = auth.uid()
    )
  );

CREATE POLICY "Salons can insert order items for their orders"
  ON public.order_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = order_items.order_id
      AND orders.salon_id = auth.uid()
    )
  );

-- 5. PAYMENT TRANSACTIONS
CREATE TABLE IF NOT EXISTS public.payment_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id TEXT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  salon_id UUID NOT NULL REFERENCES public.salon_profiles(id),
  amount NUMERIC(10, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  gateway TEXT NOT NULL DEFAULT 'RAZORPAY',
  razorpay_order_id TEXT NOT NULL,
  razorpay_payment_id TEXT,
  razorpay_signature TEXT,
  status TEXT NOT NULL CHECK (status IN ('CREATED', 'AUTHORIZED', 'CAPTURED', 'FAILED')),
  idempotency_key TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  verified_at TIMESTAMPTZ
);

ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Salons can view their own payment transactions"
  ON public.payment_transactions FOR SELECT
  USING (auth.uid() = salon_id);

-- 6. INVOICES TABLE
CREATE TABLE IF NOT EXISTS public.invoices (
  id TEXT PRIMARY KEY,
  order_id TEXT UNIQUE NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  salon_id UUID NOT NULL REFERENCES public.salon_profiles(id),
  invoice_number TEXT UNIQUE NOT NULL,
  amount_taxable NUMERIC(10, 2) NOT NULL,
  cgst_amount NUMERIC(10, 2) NOT NULL,
  sgst_amount NUMERIC(10, 2) NOT NULL,
  total_amount NUMERIC(10, 2) NOT NULL,
  issued_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Salons can view their own invoices"
  ON public.invoices FOR SELECT
  USING (auth.uid() = salon_id);

-- 7. SEED INITIAL PRODUCTS
INSERT INTO public.products (id, sku, name, category, size, image_url, reference_offer_price, mrp, description)
VALUES 
  ('shea-butter-combo', 'MOD7-SB-COMBO-01', 'Shea Butter Shampoo + Conditioner Combo', 'Professional Backbar & Retail Combo', '350ml + 350ml', '/assets/modish7/shea-butter-shampoo-conditioner.webp', 3230, 3400, 'Dual-action restructuring formula powered by certified African Shea Butter and Moroccan Argan Oil.'),
  ('mks-eco-detangler', 'MOD7-MKS-DET-02', 'MKS eco Leave-In & Detangler', 'Intensive Hair Treatment & Cutting Lotion', '118ml', '/assets/modish7/mks-eco-leave-in-detangler.webp', 2089, 2199, 'Ultra-lightweight detangling mist enriched with pure Argan and Hemp seed oils.'),
  ('shea-butter-conditioner', 'MOD7-SB-COND-03', 'Shea Butter Conditioner', 'Deep Lipid Sealant Conditioner', '350ml', '/assets/modish7/shea-butter-conditioner.webp', 1615, 1700, 'Concentrated rinse-out conditioning treatment engineered to neutralise hard-water hardness.'),
  ('anti-dandruff-shampoo', 'MOD7-AD-SHAMP-04', 'Anti-Dandruff Shampoo', 'Scalp Clarifying & Balancing Shampoo', '350ml', '/assets/modish7/anti-dandruff-shampoo.webp', 1615, 1700, 'Dermatologically balanced clarifying formula targeting flakes and micro-inflammation.')
ON CONFLICT (id) DO NOTHING;
