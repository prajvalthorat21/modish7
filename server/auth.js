import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import db from './db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'modish7_salon_secret_key_prod_2026_xyz';
const TOKEN_EXPIRY = '7d';

/**
 * Hash password with bcrypt
 */
export function hashPassword(plainPassword) {
  const salt = bcrypt.genSaltSync(10);
  return bcrypt.hashSync(plainPassword, salt);
}

/**
 * Verify plain password against bcrypt hash
 */
export function verifyPassword(plainPassword, hash) {
  return bcrypt.compareSync(plainPassword, hash);
}

/**
 * Create JWT session token
 */
export function createSessionToken(salon, rememberMe = false) {
  const expiresIn = rememberMe ? '30d' : '7d';
  return jwt.sign(
    {
      salonId: salon.id,
      email: salon.email,
      businessName: salon.business_name || salon.full_name
    },
    JWT_SECRET,
    { expiresIn }
  );
}

/**
 * Verify JWT session token
 */
export function verifySessionToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

/**
 * Extract and authenticate salon partner / customer from request
 */
export function getAuthenticatedSalon(req) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  let token = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (req.headers.cookie) {
    // Check if token stored in cookie
    const cookies = Object.fromEntries(
      req.headers.cookie.split(';').map(c => c.trim().split('='))
    );
    token = cookies['modish7_session'];
  }

  if (!token) return null;

  const payload = verifySessionToken(token);
  if (!payload || !payload.salonId) return null;

  const salon = db.prepare(`
    SELECT id, full_name, business_name, email, phone, city, business_address, state, gstin, billing_address, is_verified, auth_provider, google_id, avatar_url, created_at, updated_at
    FROM salons WHERE id = ?
  `).get(payload.salonId);

  return salon || null;
}

/**
 * Generate cryptographically secure random token for password reset
 */
export function generatePasswordResetToken() {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + 3600 * 1000; // 1 hour
  return { token, expiresAt };
}
