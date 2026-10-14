import crypto from 'node:crypto';
import db from './db.js';
import {
  hashPassword,
  verifyPassword,
  createSessionToken,
  getAuthenticatedSalon,
  generatePasswordResetToken
} from './auth.js';
import {
  createGatewayOrder,
  verifyPaymentSignature,
  verifyWebhookSignature,
  generateInvoiceDetails,
  isRazorpayConfigured
} from './razorpay.js';

/**
 * Parse JSON request body helper
 */
async function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 1e6) {
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (err) {
        reject(new Error('Invalid JSON format'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Send JSON response helper
 */
function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

/**
 * Main API Request Dispatcher
 */
export async function handleApiRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;
  const method = req.method.toUpperCase();

  // CORS headers if needed
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  try {
    // ------------------------------------------------------------------------
    // 1. AUTHENTICATION ROUTES
    // ------------------------------------------------------------------------

    // POST /api/auth/register
    if (pathname === '/api/auth/register' && method === 'POST') {
      const body = await parseJsonBody(req);
      const { fullName, businessName, email, password, confirmPassword, termsAgreed, phone, city } = body;

      if (!fullName || !email || !password) {
        return sendJson(res, 400, { success: false, error: 'Full name, email address, and password are required.' });
      }

      if (!termsAgreed) {
        return sendJson(res, 400, { success: false, error: 'You must agree to the privacy notice and salon terms.' });
      }

      if (confirmPassword && confirmPassword !== password) {
        return sendJson(res, 400, { success: false, error: 'Passwords do not match. Please verify.' });
      }

      const cleanEmail = email.toLowerCase().trim();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(cleanEmail)) {
        return sendJson(res, 400, { success: false, error: 'Please provide a valid email address.' });
      }

      if (password.length < 8) {
        return sendJson(res, 400, { success: false, error: 'Password must be at least 8 characters long.' });
      }

      // Check if email already exists
      const existing = db.prepare('SELECT id FROM salons WHERE email = ?').get(cleanEmail);
      if (existing) {
        return sendJson(res, 409, { success: false, error: 'An account with this email already exists. Please log in.' });
      }

      const salonId = 'salon_' + crypto.randomUUID();
      const passwordHash = hashPassword(password);
      const now = new Date().toISOString();
      const resolvedBusinessName = businessName ? businessName.trim() : (fullName.trim() + "'s Salon");
      const cleanPhone = phone ? phone.trim() : '';
      const cleanCity = city ? city.trim() : '';

      db.prepare(`
        INSERT INTO salons (id, full_name, business_name, email, phone, city, password_hash, auth_provider, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'email', ?, ?)
      `).run(salonId, fullName.trim(), resolvedBusinessName, cleanEmail, cleanPhone, cleanCity, passwordHash, now, now);

      const newSalon = db.prepare(`
        SELECT id, full_name, business_name, email, phone, city, business_address, state, gstin, billing_address, is_verified, auth_provider, avatar_url, created_at
        FROM salons WHERE id = ?
      `).get(salonId);

      const token = createSessionToken(newSalon, false);
      const maxAge = 7 * 24 * 3600;
      res.setHeader('Set-Cookie', `modish7_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`);

      return sendJson(res, 201, {
        success: true,
        message: 'Account registered successfully.',
        salon: newSalon,
        token
      });
    }

    // POST /api/auth/login
    if (pathname === '/api/auth/login' && method === 'POST') {
      const body = await parseJsonBody(req);
      const { email, password, rememberMe } = body;

      if (!email || !password) {
        return sendJson(res, 400, { success: false, error: 'Email and password are required.' });
      }

      const cleanEmail = email.toLowerCase().trim();
      const salon = db.prepare('SELECT * FROM salons WHERE email = ?').get(cleanEmail);

      if (!salon) {
        return sendJson(res, 401, { success: false, error: 'Invalid email or password.' });
      }

      if (salon.auth_provider === 'google' && salon.password_hash === 'google_oauth_managed') {
        return sendJson(res, 401, {
          success: false,
          error: 'This account was created with Google. Please use the "Continue with Google" button.'
        });
      }

      if (!verifyPassword(password, salon.password_hash)) {
        return sendJson(res, 401, { success: false, error: 'Invalid email or password.' });
      }

      const safeSalon = {
        id: salon.id,
        full_name: salon.full_name,
        business_name: salon.business_name,
        email: salon.email,
        phone: salon.phone,
        city: salon.city,
        business_address: salon.business_address,
        state: salon.state,
        gstin: salon.gstin,
        billing_address: salon.billing_address,
        is_verified: salon.is_verified,
        auth_provider: salon.auth_provider || 'email',
        avatar_url: salon.avatar_url || '',
        created_at: salon.created_at
      };

      const token = createSessionToken(safeSalon, Boolean(rememberMe));
      const maxAge = rememberMe ? 30 * 24 * 3600 : 7 * 24 * 3600;
      res.setHeader('Set-Cookie', `modish7_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`);

      return sendJson(res, 200, {
        success: true,
        message: 'Authentication successful.',
        salon: safeSalon,
        token
      });
    }

    // GET /api/auth/google - Initiate Google OAuth
    if (pathname === '/api/auth/google' && method === 'GET') {
      const googleClientId = process.env.GOOGLE_CLIENT_ID;
      const host = req.headers.host || 'localhost:5173';
      const protocol = req.headers['x-forwarded-proto'] || 'http';
      const redirectUri = `${protocol}://${host}/api/auth/google/callback`;

      if (!googleClientId) {
        // Return clear diagnostic response or redirect with warning if credentials not yet added to .env
        const accept = req.headers.accept || '';
        if (accept.includes('application/json')) {
          return sendJson(res, 200, {
            success: false,
            configured: false,
            error: 'Google OAuth Client ID is not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.'
          });
        }
        res.statusCode = 302;
        res.setHeader('Location', '/login?error=google_not_configured');
        return res.end();
      }

      const state = crypto.randomBytes(16).toString('hex');
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(googleClientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=openid%20email%20profile&access_type=offline&prompt=select_account&state=${state}`;

      res.statusCode = 302;
      res.setHeader('Location', authUrl);
      return res.end();
    }

    // GET /api/auth/google/callback - Handle Google OAuth Callback
    if (pathname === '/api/auth/google/callback' && method === 'GET') {
      const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const code = parsedUrl.searchParams.get('code');
      const error = parsedUrl.searchParams.get('error');

      if (error || !code) {
        res.statusCode = 302;
        res.setHeader('Location', `/login?error=${encodeURIComponent(error || 'google_auth_failed')}`);
        return res.end();
      }

      try {
        const host = req.headers.host || 'localhost:5173';
        const protocol = req.headers['x-forwarded-proto'] || 'http';
        const redirectUri = `${protocol}://${host}/api/auth/google/callback`;

        // Exchange authorization code for tokens
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code,
            client_id: process.env.GOOGLE_CLIENT_ID || '',
            client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
            redirect_uri: redirectUri,
            grant_type: 'authorization_code'
          }).toString()
        });

        const tokenData = await tokenRes.json();
        if (!tokenData.access_token) {
          throw new Error(tokenData.error_description || 'Failed to exchange Google OAuth code');
        }

        // Fetch user info from Google
        const userinfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${tokenData.access_token}` }
        });
        const googleUser = await userinfoRes.json();

        if (!googleUser || !googleUser.email) {
          throw new Error('Google userinfo did not contain email');
        }

        const cleanEmail = googleUser.email.toLowerCase().trim();
        const googleId = googleUser.sub;
        const now = new Date().toISOString();

        // Check if customer exists by email or google_id
        let salon = db.prepare('SELECT * FROM salons WHERE email = ? OR google_id = ?').get(cleanEmail, googleId);

        if (salon) {
          // Update google_id and avatar if missing
          db.prepare(`
            UPDATE salons 
            SET google_id = COALESCE(google_id, ?),
                avatar_url = COALESCE(NULLIF(avatar_url, ''), ?),
                updated_at = ?
            WHERE id = ?
          `).run(googleId, googleUser.picture || '', now, salon.id);

          salon = db.prepare('SELECT * FROM salons WHERE id = ?').get(salon.id);
        } else {
          // Create new customer account from Google Profile
          const newId = 'salon_' + crypto.randomUUID();
          const fullName = googleUser.name || 'Salon Customer';
          const businessName = fullName + "'s Salon";

          db.prepare(`
            INSERT INTO salons (id, full_name, business_name, email, phone, city, password_hash, auth_provider, google_id, avatar_url, created_at, updated_at)
            VALUES (?, ?, ?, ?, '', '', 'google_oauth_managed', 'google', ?, ?, ?, ?)
          `).run(newId, fullName, businessName, cleanEmail, googleId, googleUser.picture || '', now, now);

          salon = db.prepare('SELECT * FROM salons WHERE id = ?').get(newId);
        }

        const token = createSessionToken(salon, true);
        const maxAge = 30 * 24 * 3600;
        res.setHeader('Set-Cookie', `modish7_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`);

        // Redirect to account with token param so client-side localStorage also picks it up
        res.statusCode = 302;
        res.setHeader('Location', `/account?token=${encodeURIComponent(token)}&google=1`);
        return res.end();

      } catch (oauthErr) {
        console.error('[Google OAuth Callback Error]:', oauthErr);
        res.statusCode = 302;
        res.setHeader('Location', `/login?error=${encodeURIComponent(oauthErr.message || 'google_auth_failed')}`);
        return res.end();
      }
    }

    // POST /api/auth/google/token - Google Identity Services (GIS) / Token Verification
    if (pathname === '/api/auth/google/token' && method === 'POST') {
      const body = await parseJsonBody(req);
      const { credential } = body;

      if (!credential) {
        return sendJson(res, 400, { success: false, error: 'Google credential ID token is required.' });
      }

      try {
        const verifyRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
        const tokenInfo = await verifyRes.json();

        if (!tokenInfo || !tokenInfo.email) {
          return sendJson(res, 400, { success: false, error: 'Invalid Google ID token.' });
        }

        const cleanEmail = tokenInfo.email.toLowerCase().trim();
        const googleId = tokenInfo.sub;
        const now = new Date().toISOString();

        let salon = db.prepare('SELECT * FROM salons WHERE email = ? OR google_id = ?').get(cleanEmail, googleId);

        if (salon) {
          db.prepare(`
            UPDATE salons 
            SET google_id = COALESCE(google_id, ?),
                avatar_url = COALESCE(NULLIF(avatar_url, ''), ?),
                updated_at = ?
            WHERE id = ?
          `).run(googleId, tokenInfo.picture || '', now, salon.id);

          salon = db.prepare('SELECT * FROM salons WHERE id = ?').get(salon.id);
        } else {
          const newId = 'salon_' + crypto.randomUUID();
          const fullName = tokenInfo.name || 'Salon Customer';
          const businessName = fullName + "'s Salon";

          db.prepare(`
            INSERT INTO salons (id, full_name, business_name, email, phone, city, password_hash, auth_provider, google_id, avatar_url, created_at, updated_at)
            VALUES (?, ?, ?, ?, '', '', 'google_oauth_managed', 'google', ?, ?, ?, ?)
          `).run(newId, fullName, businessName, cleanEmail, googleId, tokenInfo.picture || '', now, now);

          salon = db.prepare('SELECT * FROM salons WHERE id = ?').get(newId);
        }

        const token = createSessionToken(salon, true);
        const maxAge = 30 * 24 * 3600;
        res.setHeader('Set-Cookie', `modish7_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`);

        return sendJson(res, 200, {
          success: true,
          message: 'Google Sign-In successful.',
          salon,
          token
        });
      } catch (gisErr) {
        console.error('[Google Token Verification Error]:', gisErr);
        return sendJson(res, 500, { success: false, error: 'Google authentication service error.' });
      }
    }

    // GET /api/auth/me
    if (pathname === '/api/auth/me' && method === 'GET') {
      const salon = getAuthenticatedSalon(req);
      if (!salon) {
        return sendJson(res, 401, { success: false, error: 'Not authenticated or session expired.' });
      }
      return sendJson(res, 200, { success: true, salon });
    }

    // POST /api/auth/logout
    if (pathname === '/api/auth/logout' && method === 'POST') {
      res.setHeader('Set-Cookie', 'modish7_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax');
      return sendJson(res, 200, { success: true, message: 'Logged out successfully.' });
    }

    // POST /api/auth/change-password (Authenticated Customer Password Update)
    if (pathname === '/api/auth/change-password' && method === 'POST') {
      const salon = getAuthenticatedSalon(req);
      if (!salon) return sendJson(res, 401, { success: false, error: 'Unauthorized' });

      const body = await parseJsonBody(req);
      const { currentPassword, newPassword } = body;

      if (!newPassword || newPassword.length < 8) {
        return sendJson(res, 400, { success: false, error: 'New password must be at least 8 characters long.' });
      }

      // Check current password if user has an existing password set
      const userRecord = db.prepare('SELECT password_hash, auth_provider FROM salons WHERE id = ?').get(salon.id);
      if (userRecord.password_hash !== 'google_oauth_managed') {
        if (!currentPassword || !verifyPassword(currentPassword, userRecord.password_hash)) {
          return sendJson(res, 400, { success: false, error: 'Current password is incorrect.' });
        }
      }

      const newHash = hashPassword(newPassword);
      const now = new Date().toISOString();
      db.prepare('UPDATE salons SET password_hash = ?, updated_at = ? WHERE id = ?')
        .run(newHash, now, salon.id);

      return sendJson(res, 200, { success: true, message: 'Password has been updated successfully.' });
    }

    // POST /api/auth/recover
    if (pathname === '/api/auth/recover' && method === 'POST') {
      const body = await parseJsonBody(req);
      const { email } = body;
      if (!email) {
        return sendJson(res, 400, { success: false, error: 'Email address is required.' });
      }

      const cleanEmail = email.toLowerCase().trim();
      const salon = db.prepare('SELECT id FROM salons WHERE email = ?').get(cleanEmail);

      let resetCode = null;
      if (salon) {
        const { token, expiresAt } = generatePasswordResetToken();
        db.prepare('UPDATE salons SET reset_token = ?, reset_token_expires = ? WHERE id = ?')
          .run(token, expiresAt, salon.id);
        resetCode = token;
      }

      return sendJson(res, 200, {
        success: true,
        message: 'If the provided email is registered, password recovery instructions have been dispatched.',
        resetToken: resetCode // returned for sandbox/dev testing
      });
    }

    // POST /api/auth/reset-password
    if (pathname === '/api/auth/reset-password' && method === 'POST') {
      const body = await parseJsonBody(req);
      const { token, newPassword } = body;

      if (!token || !newPassword || newPassword.length < 8) {
        return sendJson(res, 400, { success: false, error: 'Valid token and new password (min 8 characters) required.' });
      }

      const now = Date.now();
      const salon = db.prepare('SELECT id FROM salons WHERE reset_token = ? AND reset_token_expires > ?')
        .get(token, now);

      if (!salon) {
        return sendJson(res, 400, { success: false, error: 'Reset token is invalid or has expired.' });
      }

      const newHash = hashPassword(newPassword);
      db.prepare('UPDATE salons SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?')
        .run(newHash, salon.id);

      return sendJson(res, 200, { success: true, message: 'Password has been updated successfully. Please log in.' });
    }

    // ------------------------------------------------------------------------
    // 2. SALON PROFILE ROUTES
    // ------------------------------------------------------------------------

    // GET /api/profile
    if (pathname === '/api/profile' && method === 'GET') {
      const salon = getAuthenticatedSalon(req);
      if (!salon) return sendJson(res, 401, { success: false, error: 'Unauthorized' });
      return sendJson(res, 200, { success: true, profile: salon });
    }

    // PUT /api/profile
    if (pathname === '/api/profile' && method === 'PUT') {
      const salon = getAuthenticatedSalon(req);
      if (!salon) return sendJson(res, 401, { success: false, error: 'Unauthorized' });

      const body = await parseJsonBody(req);
      const { fullName, businessName, phone, city, businessAddress, state, gstin, billingAddress } = body;

      const now = new Date().toISOString();
      db.prepare(`
        UPDATE salons
        SET full_name = COALESCE(?, full_name),
            business_name = COALESCE(?, business_name),
            phone = COALESCE(?, phone),
            city = COALESCE(?, city),
            business_address = COALESCE(?, business_address),
            state = COALESCE(?, state),
            gstin = COALESCE(?, gstin),
            billing_address = COALESCE(?, billing_address),
            updated_at = ?
        WHERE id = ?
      `).run(
        fullName ? fullName.trim() : null,
        businessName ? businessName.trim() : null,
        phone ? phone.trim() : null,
        city ? city.trim() : null,
        businessAddress ? businessAddress.trim() : null,
        state ? state.trim() : null,
        gstin ? gstin.trim().toUpperCase() : null,
        billingAddress ? billingAddress.trim() : null,
        now,
        salon.id
      );

      const updated = db.prepare(`
        SELECT id, full_name, business_name, email, phone, city, business_address, state, gstin, billing_address, is_verified, created_at, updated_at
        FROM salons WHERE id = ?
      `).get(salon.id);

      return sendJson(res, 200, { success: true, message: 'Business profile updated.', profile: updated });
    }

    // ------------------------------------------------------------------------
    // 3. PRODUCTS CATALOGUE ROUTE
    // ------------------------------------------------------------------------

    // GET /api/products
    if (pathname === '/api/products' && method === 'GET') {
      const products = db.prepare('SELECT * FROM products WHERE in_stock = 1 ORDER BY id').all();
      return sendJson(res, 200, { success: true, products });
    }

    // ------------------------------------------------------------------------
    // 4. ORDER & QUOTATION ROUTES
    // ------------------------------------------------------------------------

    // POST /api/orders
    if (pathname === '/api/orders' && method === 'POST') {
      const salon = getAuthenticatedSalon(req);
      if (!salon) return sendJson(res, 401, { success: false, error: 'Please log in to submit a salon order request.' });

      const body = await parseJsonBody(req);
      const { items, notes } = body;

      if (!Array.isArray(items) || items.length === 0) {
        return sendJson(res, 400, { success: false, error: 'Order must contain at least one product.' });
      }

      // Validate products and compute server-side reference total (never trust browser total)
      let referenceTotal = 0;
      const validatedItems = [];

      for (const item of items) {
        const qty = parseInt(item.quantity, 10);
        if (isNaN(qty) || qty <= 0) {
          return sendJson(res, 400, { success: false, error: 'Quantity must be a positive integer.' });
        }

        const product = db.prepare('SELECT * FROM products WHERE id = ?').get(item.productId);
        if (!product) {
          return sendJson(res, 400, { success: false, error: `Product ID not recognized: ${item.productId}` });
        }

        const subtotal = product.reference_offer_price * qty;
        referenceTotal += subtotal;

        validatedItems.push({
          productId: product.id,
          productName: product.name,
          quantity: qty,
          unitReferencePrice: product.reference_offer_price,
          subtotal
        });
      }

      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      const orderId = `ORD-MOD7-${dateStr}-${randomSuffix}`;
      const now = new Date().toISOString();

      // Insert Order and Items transactionally
      db.exec('BEGIN TRANSACTION;');
      try {
        db.prepare(`
          INSERT INTO orders (id, salon_id, status, reference_total_amount, notes, created_at, updated_at)
          VALUES (?, ?, 'PENDING_REVIEW', ?, ?, ?, ?)
        `).run(orderId, salon.id, referenceTotal, notes ? notes.trim() : '', now, now);

        const insertItem = db.prepare(`
          INSERT INTO order_items (id, order_id, product_id, product_name, quantity, unit_reference_price, subtotal)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        for (const item of validatedItems) {
          const itemId = 'item_' + crypto.randomUUID();
          insertItem.run(itemId, orderId, item.productId, item.productName, item.quantity, item.unitReferencePrice, item.subtotal);
        }

        db.exec('COMMIT;');
      } catch (err) {
        db.exec('ROLLBACK;');
        throw err;
      }

      const createdOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
      createdOrder.items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all();

      return sendJson(res, 201, {
        success: true,
        message: 'Order request submitted for commercial team review.',
        order: createdOrder
      });
    }

    // GET /api/orders
    if (pathname === '/api/orders' && method === 'GET') {
      const salon = getAuthenticatedSalon(req);
      if (!salon) return sendJson(res, 401, { success: false, error: 'Unauthorized' });

      const orders = db.prepare('SELECT * FROM orders WHERE salon_id = ? ORDER BY created_at DESC').all(salon.id);
      for (const order of orders) {
        order.items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
        if (order.status === 'PAID') {
          order.invoice = db.prepare('SELECT * FROM invoices WHERE order_id = ?').get(order.id);
        }
      }

      return sendJson(res, 200, { success: true, orders });
    }

    // GET /api/orders/:id
    if (pathname.startsWith('/api/orders/') && method === 'GET') {
      const salon = getAuthenticatedSalon(req);
      if (!salon) return sendJson(res, 401, { success: false, error: 'Unauthorized' });

      const orderId = pathname.replace('/api/orders/', '').trim();
      const order = db.prepare('SELECT * FROM orders WHERE id = ? AND salon_id = ?').get(orderId, salon.id);

      if (!order) {
        return sendJson(res, 404, { success: false, error: 'Order not found.' });
      }

      order.items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
      if (order.status === 'PAID') {
        order.invoice = db.prepare('SELECT * FROM invoices WHERE order_id = ?').get(order.id);
      }

      return sendJson(res, 200, { success: true, order });
    }

    // POST /api/orders/:id/approve-quotation (Commercial Review Approval Simulator)
    if (pathname.includes('/approve-quotation') && method === 'POST') {
      const salon = getAuthenticatedSalon(req);
      if (!salon) return sendJson(res, 401, { success: false, error: 'Unauthorized' });

      const orderId = pathname.split('/')[3];
      const order = db.prepare('SELECT * FROM orders WHERE id = ? AND salon_id = ?').get(orderId, salon.id);

      if (!order) {
        return sendJson(res, 404, { success: false, error: 'Order not found.' });
      }

      if (order.status !== 'PENDING_REVIEW') {
        return sendJson(res, 400, { success: false, error: `Order is already in ${order.status} state.` });
      }

      // Commercial team approves the quotation (e.g. reference rate or confirmed commercial terms)
      const approvedAmount = order.reference_total_amount;
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
      const quotationRef = `QT-MOD7-${Math.floor(10000 + Math.random() * 90000)}`;

      db.prepare(`
        UPDATE orders
        SET status = 'QUOTATION_APPROVED',
            approved_payable_amount = ?,
            quotation_ref = ?,
            quotation_approved_at = ?,
            quotation_expires_at = ?,
            updated_at = ?
        WHERE id = ?
      `).run(approvedAmount, quotationRef, now.toISOString(), expiresAt.toISOString(), now.toISOString(), order.id);

      const updated = db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id);
      updated.items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);

      return sendJson(res, 200, {
        success: true,
        message: 'Quotation confirmed and approved. Ready for online payment.',
        order: updated
      });
    }

    // ------------------------------------------------------------------------
    // 5. PAYMENT ROUTES (RAZORPAY INTEGRATION)
    // ------------------------------------------------------------------------

    // POST /api/payments/create-order
    if (pathname === '/api/payments/create-order' && method === 'POST') {
      const salon = getAuthenticatedSalon(req);
      if (!salon) return sendJson(res, 401, { success: false, error: 'Unauthorized' });

      const body = await parseJsonBody(req);
      const { orderId } = body;

      if (!orderId) {
        return sendJson(res, 400, { success: false, error: 'Order ID is required.' });
      }

      const order = db.prepare('SELECT * FROM orders WHERE id = ? AND salon_id = ?').get(orderId, salon.id);
      if (!order) {
        return sendJson(res, 404, { success: false, error: 'Order not found.' });
      }

      if (order.status !== 'QUOTATION_APPROVED' && order.status !== 'PAYMENT_PENDING') {
        return sendJson(res, 400, { success: false, error: `Cannot pay for order with status '${order.status}'. Must be QUOTATION_APPROVED.` });
      }

      // Amount verified server-side in paise (1 INR = 100 paise)
      const amountInPaise = Math.round(order.approved_payable_amount * 100);

      const gatewayResponse = await createGatewayOrder({
        orderId: order.id,
        amountInPaise,
        currency: 'INR',
        salonName: salon.business_name,
        salonEmail: salon.email
      });

      // Record transaction creation
      const txId = 'tx_' + crypto.randomUUID();
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO payment_transactions (id, order_id, salon_id, amount, currency, gateway, razorpay_order_id, status, created_at)
        VALUES (?, ?, ?, ?, 'INR', ?, ?, 'CREATED', ?)
      `).run(txId, order.id, salon.id, order.approved_payable_amount, gatewayResponse.gateway, gatewayResponse.razorpay_order_id, now);

      db.prepare(`
        UPDATE orders
        SET razorpay_order_id = ?, status = 'PAYMENT_PENDING', updated_at = ?
        WHERE id = ?
      `).run(gatewayResponse.razorpay_order_id, now, order.id);

      return sendJson(res, 200, {
        success: true,
        orderId: order.id,
        amount: order.approved_payable_amount,
        amountInPaise,
        currency: 'INR',
        gatewayData: gatewayResponse
      });
    }

    // POST /api/payments/verify
    if (pathname === '/api/payments/verify' && method === 'POST') {
      const salon = getAuthenticatedSalon(req);
      if (!salon) return sendJson(res, 401, { success: false, error: 'Unauthorized' });

      const body = await parseJsonBody(req);
      const { orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;

      if (!orderId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        return sendJson(res, 400, { success: false, error: 'Missing payment signature verification parameters.' });
      }

      const order = db.prepare('SELECT * FROM orders WHERE id = ? AND salon_id = ?').get(orderId, salon.id);
      if (!order) {
        return sendJson(res, 404, { success: false, error: 'Order not found.' });
      }

      if (order.status === 'PAID') {
        return sendJson(res, 200, { success: true, message: 'Order is already marked as paid.', order });
      }

      // Verify signature on server (prevent client payment spoofing)
      const isValid = verifyPaymentSignature({
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
        signature: razorpay_signature
      });

      if (!isValid) {
        return sendJson(res, 400, { success: false, error: 'Payment signature verification failed.' });
      }

      const now = new Date().toISOString();
      const trackingNumber = 'MOD7-EXP-' + Math.floor(10000000 + Math.random() * 90000000);

      // Generate GST Tax Invoice
      const invoiceData = generateInvoiceDetails(order, salon);
      const invoiceId = 'inv_' + crypto.randomUUID();

      db.exec('BEGIN TRANSACTION;');
      try {
        db.prepare(`
          UPDATE payment_transactions
          SET status = 'CAPTURED',
              razorpay_payment_id = ?,
              razorpay_signature = ?,
              verified_at = ?
          WHERE order_id = ? AND razorpay_order_id = ?
        `).run(razorpay_payment_id, razorpay_signature, now, order.id, razorpay_order_id);

        db.prepare(`
          INSERT INTO invoices (id, order_id, salon_id, invoice_number, amount_taxable, cgst_amount, sgst_amount, total_amount, issued_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          invoiceId,
          order.id,
          salon.id,
          invoiceData.invoice_number,
          invoiceData.amount_taxable,
          invoiceData.cgst_amount,
          invoiceData.sgst_amount,
          invoiceData.total_amount,
          invoiceData.issued_at
        );

        db.prepare(`
          UPDATE orders
          SET status = 'PAID',
              razorpay_payment_id = ?,
              paid_at = ?,
              invoice_id = ?,
              tracking_number = ?,
              delivery_status = 'CONFIRMED_PREPARING',
              updated_at = ?
          WHERE id = ?
        `).run(razorpay_payment_id, now, invoiceId, trackingNumber, now, order.id);

        db.exec('COMMIT;');
      } catch (err) {
        db.exec('ROLLBACK;');
        throw err;
      }

      const updatedOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id);
      updatedOrder.items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
      const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId);

      return sendJson(res, 200, {
        success: true,
        message: 'Payment verified successfully and official tax invoice generated.',
        order: updatedOrder,
        invoice
      });
    }

    // POST /api/webhooks/razorpay
    if (pathname === '/api/webhooks/razorpay' && method === 'POST') {
      const signature = req.headers['x-razorpay-signature'];
      const rawBody = await new Promise((resolve) => {
        let b = '';
        req.on('data', c => b += c);
        req.on('end', () => resolve(b));
      });

      // Verify webhook signature if secret configured
      if (process.env.RAZORPAY_WEBHOOK_SECRET) {
        const isValid = verifyWebhookSignature(rawBody, signature);
        if (!isValid) {
          return sendJson(res, 400, { error: 'Invalid webhook signature' });
        }
      }

      let payload = {};
      try {
        payload = JSON.parse(rawBody);
      } catch (e) {
        return sendJson(res, 400, { error: 'Invalid JSON' });
      }

      const event = payload.event;
      if (event === 'order.paid' || event === 'payment.captured') {
        const paymentEntity = payload.payload?.payment?.entity || {};
        const rzpOrderId = paymentEntity.order_id;
        const rzpPaymentId = paymentEntity.id;

        if (rzpOrderId) {
          const order = db.prepare('SELECT * FROM orders WHERE razorpay_order_id = ?').get(rzpOrderId);
          if (order && order.status !== 'PAID') {
            const now = new Date().toISOString();
            db.prepare(`
              UPDATE orders
              SET status = 'PAID', razorpay_payment_id = ?, paid_at = ?, updated_at = ?
              WHERE id = ?
            `).run(rzpPaymentId, now, now, order.id);
            console.log(`[Razorpay Webhook] Order ${order.id} marked PAID via webhook.`);
          }
        }
      }

      return sendJson(res, 200, { status: 'ok' });
    }

    // ------------------------------------------------------------------------
    // 6. INVOICE ROUTE
    // ------------------------------------------------------------------------

    // GET /api/invoices/:orderId
    if (pathname.startsWith('/api/invoices/') && method === 'GET') {
      const salon = getAuthenticatedSalon(req);
      if (!salon) return sendJson(res, 401, { success: false, error: 'Unauthorized' });

      const orderId = pathname.replace('/api/invoices/', '').trim();
      const invoice = db.prepare('SELECT * FROM invoices WHERE order_id = ? AND salon_id = ?').get(orderId, salon.id);

      if (!invoice) {
        return sendJson(res, 404, { success: false, error: 'Invoice not found.' });
      }

      const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
      const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId);

      return sendJson(res, 200, {
        success: true,
        invoice,
        order,
        items,
        salon
      });
    }

    // Unmatched API route
    return sendJson(res, 404, { success: false, error: 'API endpoint not found.' });

  } catch (error) {
    console.error('[API Handler Error]:', error);
    return sendJson(res, 500, { success: false, error: error.message || 'Internal Server Error' });
  }
}
