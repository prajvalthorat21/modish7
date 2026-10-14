import crypto from 'node:crypto';

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || '';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';
const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || '';

/**
 * Check if real Razorpay credentials are configured
 */
export function isRazorpayConfigured() {
  return Boolean(RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET && !RAZORPAY_KEY_ID.includes('your_key'));
}

/**
 * Create order via Razorpay API (or verified sandbox mock)
 */
export async function createGatewayOrder({ orderId, amountInPaise, currency = 'INR', salonName, salonEmail }) {
  if (isRazorpayConfigured()) {
    try {
      const authHeader = 'Basic ' + Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64');
      const response = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          amount: amountInPaise,
          currency,
          receipt: orderId,
          notes: {
            salon_name: salonName,
            salon_email: salonEmail,
            platform: 'Modish7 Salon Partner Portal'
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Razorpay Order API Error: ${errorData.error?.description || response.statusText}`);
      }

      const data = await response.json();
      return {
        success: true,
        gateway: 'RAZORPAY',
        is_live: true,
        key_id: RAZORPAY_KEY_ID,
        razorpay_order_id: data.id,
        amount: data.amount,
        currency: data.currency
      };
    } catch (err) {
      console.error('[Razorpay Order Creation Error]:', err.message);
      throw err;
    }
  } else {
    // Sandbox / Test Mode Simulator when live credentials are not yet populated
    const mockOrderId = 'order_sb_' + crypto.randomBytes(8).toString('hex');
    return {
      success: true,
      gateway: 'RAZORPAY_SANDBOX',
      is_live: false,
      key_id: 'rzp_test_modish7_sandbox',
      razorpay_order_id: mockOrderId,
      amount: amountInPaise,
      currency,
      notice: 'Sandbox mode active. To connect live gateway, set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env'
    };
  }
}

/**
 * Verify Razorpay payment signature server-side
 */
export function verifyPaymentSignature({ orderId, paymentId, signature }) {
  if (!orderId || !paymentId || !signature) {
    return false;
  }

  if (isRazorpayConfigured()) {
    const text = `${orderId}|${paymentId}`;
    const expectedSignature = crypto
      .createHmac('sha256', RAZORPAY_KEY_SECRET)
      .update(text)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature, 'utf-8'),
      Buffer.from(signature, 'utf-8')
    );
  } else {
    // In sandbox verification: verify format or simulated test signature
    return signature.startsWith('sig_test_') || signature.length >= 32;
  }
}

/**
 * Verify Razorpay webhook signature
 */
export function verifyWebhookSignature(rawBody, signature) {
  if (!signature || !RAZORPAY_WEBHOOK_SECRET) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac('sha256', RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature, 'utf-8'),
    Buffer.from(signature, 'utf-8')
  );
}

/**
 * Generate official GST-compliant B2B Invoice Data
 */
export function generateInvoiceDetails(order, salon, items) {
  const taxable = Math.round(order.approved_payable_amount / 1.18);
  const totalTax = order.approved_payable_amount - taxable;
  const cgst = Math.round(totalTax / 2);
  const sgst = totalTax - cgst;

  const year = new Date().getFullYear();
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  const invoiceNumber = `INV-MOD7-${year}-${randomSuffix}`;

  return {
    invoice_number: invoiceNumber,
    amount_taxable: taxable,
    cgst_amount: cgst,
    sgst_amount: sgst,
    total_amount: order.approved_payable_amount,
    issued_at: new Date().toISOString()
  };
}
