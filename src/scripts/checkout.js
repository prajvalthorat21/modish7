import { Auth } from './auth.js';
import { CartManager } from './cart.js';

let currentSalon = null;
let currentPricing = null;
let pendingOrderId = null;
let currentInvoiceData = null;

document.addEventListener('DOMContentLoaded', async () => {
  initCheckout();
});

async function initCheckout() {
  const items = CartManager.getItems();

  const emptyView = document.getElementById('checkoutEmptyCartView');
  const activeLayout = document.getElementById('checkoutActiveLayout');

  if (!items || items.length === 0) {
    if (emptyView) emptyView.style.display = 'block';
    if (activeLayout) activeLayout.style.display = 'none';
    return;
  }

  if (emptyView) emptyView.style.display = 'none';
  if (activeLayout) activeLayout.style.display = 'grid';

  // Check authentication
  if (Auth.isAuthenticated()) {
    currentSalon = await Auth.fetchMe();
  }

  renderAuthStatus();
  await refreshOrderSummary();
  initForm();
  initModals();
}

function renderAuthStatus() {
  const banner = document.getElementById('checkoutAuthBanner');
  const prompt = document.getElementById('checkoutAuthPrompt');
  const guestPassGroup = document.getElementById('guestPasswordGroup');

  if (currentSalon) {
    if (banner) {
      banner.style.background = '#EFF6FF';
      banner.style.borderColor = '#BFDBFE';
    }
    if (prompt) {
      prompt.innerHTML = `
        Signed in as <strong>${escapeHtml(currentSalon.full_name || currentSalon.business_name)}</strong> (${escapeHtml(currentSalon.email)}). 
        <a href="/account" class="auth-banner-link" target="_blank">Manage saved details</a>
      `;
    }
    if (guestPassGroup) guestPassGroup.style.display = 'none';

    // Autofill saved details
    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el && val && !el.value) el.value = val;
    };

    setVal('custFullName', currentSalon.full_name);
    setVal('custBusinessName', currentSalon.business_name);
    setVal('custEmail', currentSalon.email);
    setVal('custPhone', currentSalon.phone);
    setVal('shipAddress', currentSalon.business_address || currentSalon.billing_address);
    setVal('shipCity', currentSalon.city);
    setVal('shipState', currentSalon.state);
    setVal('shipPincode', currentSalon.pincode);
    setVal('shipGstin', currentSalon.gstin);
  } else {
    if (guestPassGroup) guestPassGroup.style.display = 'block';
  }
}

async function refreshOrderSummary() {
  currentPricing = await CartManager.validateWithServer();
  renderSummaryUI(currentPricing);
}

function renderSummaryUI(pricing) {
  const unitsCountEl = document.getElementById('summaryUnitsCount');
  const listEl = document.getElementById('summaryItemsList');
  const ribbonEl = document.getElementById('summaryOffersRibbon');
  const subtotalEl = document.getElementById('calcSubtotal');
  const discountRow = document.getElementById('rowDiscount');
  const discountEl = document.getElementById('calcDiscount');
  const shippingEl = document.getElementById('calcShipping');
  const taxEl = document.getElementById('calcTax');
  const totalEl = document.getElementById('calcTotal');
  const payBtnAmount = document.getElementById('payBtnAmount');

  const count = pricing.itemCount || CartManager.getTotalCount();
  if (unitsCountEl) unitsCountEl.textContent = count === 1 ? '1 item' : `${count} items`;

  // Render Line items
  if (listEl) {
    listEl.innerHTML = pricing.items.map(item => `
      <div class="summary-item-row">
        <img src="${item.imageUrl}" alt="${item.productName || item.name}" class="summary-item-img">
        <div class="summary-item-info">
          <div class="summary-item-name">${item.productName || item.name}</div>
          <div class="summary-item-meta">${item.size} &middot; Qty: <strong>${item.quantity}</strong> &times; ₹${item.unitPrice || item.price}</div>
        </div>
        <div class="summary-item-subtotal">₹${(item.subtotal).toLocaleString('en-IN')}</div>
      </div>
    `).join('');

    // If complimentary gift unlocked
    if (pricing.giftEligible) {
      listEl.innerHTML += `
        <div class="summary-item-row" style="background:#F0FDF4; padding:8px; border-radius:4px; border:1px dashed #BBF7D0;">
          <div style="font-size:1.5rem; line-height:1; margin-right:4px;">🎁</div>
          <div class="summary-item-info">
            <div class="summary-item-name" style="color:#15803D;">Complimentary Modish7 Travel Pouch</div>
            <div class="summary-item-meta" style="color:#166534;">Store gift on orders over ₹999 &middot; Qty: 1</div>
          </div>
          <div class="summary-item-subtotal" style="color:#16A34A;">FREE</div>
        </div>
      `;
    }
  }

  // Active Store Offers Ribbon
  if (ribbonEl) {
    let pills = [];
    if (pricing.freeShipping) {
      pills.push(`
        <div class="offer-badge-pill">
          <span class="pill-tag">SHIPPING</span>
          <span>Free Express Shipping across India applied</span>
        </div>
      `);
    }
    if (pricing.giftEligible) {
      pills.push(`
        <div class="offer-badge-pill">
          <span class="pill-tag">GIFT</span>
          <span>Complimentary Travel Pouch (Value ₹500) included</span>
        </div>
      `);
    }
    if (pricing.discountEligible) {
      pills.push(`
        <div class="offer-badge-pill">
          <span class="pill-tag">SAVINGS</span>
          <span>5% Salon Volume Savings applied (-₹${pricing.discountAmount.toLocaleString('en-IN')})</span>
        </div>
      `);
    }
    ribbonEl.innerHTML = pills.join('');
  }

  // Calculations
  if (subtotalEl) subtotalEl.textContent = `₹${pricing.subtotal.toLocaleString('en-IN')}`;

  if (discountRow && discountEl) {
    if (pricing.discountEligible && pricing.discountAmount > 0) {
      discountRow.style.display = 'flex';
      discountEl.textContent = `-₹${pricing.discountAmount.toLocaleString('en-IN')}`;
    } else {
      discountRow.style.display = 'none';
    }
  }

  if (shippingEl) {
    shippingEl.innerHTML = pricing.shippingFee === 0 ? '<strong style="color:#16A34A;">FREE</strong>' : `₹${pricing.shippingFee}`;
  }

  if (taxEl) {
    const tax = pricing.taxAmount || Math.round(pricing.totalAmount - (pricing.totalAmount / 1.18));
    taxEl.textContent = `₹${tax.toLocaleString('en-IN')}`;
  }

  if (totalEl) totalEl.textContent = `₹${pricing.totalAmount.toLocaleString('en-IN')}`;
  if (payBtnAmount) payBtnAmount.textContent = `₹${pricing.totalAmount.toLocaleString('en-IN')}`;
}

function initForm() {
  const form = document.getElementById('checkoutForm');
  const errorAlert = document.getElementById('checkoutFormError');
  const payBtn = document.getElementById('proceedToPayBtn');

  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (errorAlert) errorAlert.style.display = 'none';

    // Clear previous errors
    document.querySelectorAll('.field-error-msg').forEach(el => el.textContent = '');

    const fullName = document.getElementById('custFullName').value.trim();
    const businessName = document.getElementById('custBusinessName').value.trim();
    const email = document.getElementById('custEmail').value.trim().toLowerCase();
    const phone = document.getElementById('custPhone').value.trim();
    const address = document.getElementById('shipAddress').value.trim();
    const city = document.getElementById('shipCity').value.trim();
    const state = document.getElementById('shipState').value.trim();
    const pincode = document.getElementById('shipPincode').value.trim();
    const gstin = document.getElementById('shipGstin')?.value.trim().toUpperCase() || '';
    const notes = document.getElementById('orderNotes')?.value.trim() || '';
    const password = document.getElementById('custPassword')?.value || '';

    // Validation
    let hasError = false;
    if (!fullName) {
      document.getElementById('errFullName').textContent = 'Full name is required.';
      hasError = true;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      document.getElementById('errEmail').textContent = 'Please provide a valid email address.';
      hasError = true;
    }

    const phoneClean = phone.replace(/[^0-9]/g, '');
    if (phoneClean.length < 10) {
      document.getElementById('errPhone').textContent = 'Please provide a valid 10-digit mobile number.';
      hasError = true;
    }

    if (!address) {
      document.getElementById('errAddress').textContent = 'Delivery street address is required.';
      hasError = true;
    }

    if (!city) {
      document.getElementById('errCity').textContent = 'City is required.';
      hasError = true;
    }

    if (!state) {
      document.getElementById('errState').textContent = 'State is required.';
      hasError = true;
    }

    if (!pincode || pincode.length < 6) {
      document.getElementById('errPincode').textContent = 'Valid 6-digit PIN code is required.';
      hasError = true;
    }

    if (hasError) {
      if (errorAlert) {
        errorAlert.textContent = 'Please correct the highlighted fields before proceeding.';
        errorAlert.style.display = 'block';
      }
      return;
    }

    // Disable button to prevent duplicate clicks
    payBtn.disabled = true;
    const originalLabel = payBtn.querySelector('.pay-btn-label').textContent;
    payBtn.querySelector('.pay-btn-label').textContent = 'PROCESSING ORDER...';

    try {
      // If user is not authenticated, register them or log them in with provided email
      if (!Auth.isAuthenticated()) {
        const passToUse = password && password.length >= 8 ? password : ('Modish7@' + Math.floor(1000 + Math.random() * 9000));
        try {
          const regRes = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fullName,
              businessName: businessName || (fullName + "'s Salon"),
              email,
              password: passToUse,
              termsAgreed: true,
              phone: phoneClean,
              city
            })
          });
          const regData = await regRes.json();
          if (regData.success) {
            Auth.setSession(regData.token, regData.salon);
            currentSalon = regData.salon;
          } else if (regData.error && regData.error.includes('already exists')) {
            // Account already exists with this email, attempt login if password was supplied
            if (password) {
              const logRes = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
              });
              const logData = await logRes.json();
              if (logData.success) {
                Auth.setSession(logData.token, logData.salon);
                currentSalon = logData.salon;
              }
            }
          }
        } catch (authErr) {
          console.warn('[Checkout] Guest auth auto-link note:', authErr);
        }
      }

      // Prepare order items
      const rawItems = CartManager.getItems();
      const shippingDetails = {
        fullName,
        businessName,
        phone: phoneClean,
        address,
        city,
        state,
        pincode,
        gstin
      };

      // 1. Create order on server
      const orderRes = await Auth.authFetch('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          items: rawItems,
          shippingDetails,
          notes,
          isDirectCheckout: true
        })
      });

      const orderData = await orderRes.json();

      if (!orderData.success || !orderData.order) {
        throw new Error(orderData.error || 'Failed to initialize order.');
      }

      const order = orderData.order;
      pendingOrderId = order.id;

      // 2. Create Payment Gateway Order via Razorpay Integration
      const payRes = await Auth.authFetch('/api/payments/create-order', {
        method: 'POST',
        body: JSON.stringify({ orderId: order.id })
      });

      const payData = await payRes.json();

      if (!payData.success || !payData.gatewayData) {
        throw new Error(payData.error || 'Failed to initiate payment gateway.');
      }

      const gatewayData = payData.gatewayData;

      // Check if real live Razorpay SDK is available
      if (gatewayData.is_live && window.Razorpay) {
        const options = {
          key: gatewayData.key_id,
          amount: gatewayData.amount,
          currency: gatewayData.currency,
          name: 'Modish7 Professional Haircare',
          description: `Salon Supply Order ${order.id}`,
          image: '/favicon.png',
          order_id: gatewayData.razorpay_order_id,
          prefill: {
            name: fullName,
            email: email,
            contact: phoneClean
          },
          theme: {
            color: '#0047AB'
          },
          handler: async function(rzpResponse) {
            await verifyPayment({
              orderId: order.id,
              razorpay_order_id: rzpResponse.razorpay_order_id,
              razorpay_payment_id: rzpResponse.razorpay_payment_id,
              razorpay_signature: rzpResponse.razorpay_signature
            }, order, shippingDetails);
          },
          modal: {
            ondismiss: function() {
              payBtn.disabled = false;
              payBtn.querySelector('.pay-btn-label').textContent = originalLabel;
            }
          }
        };

        const rzp = new window.Razorpay(options);
        rzp.open();

      } else {
        // Open verified sandbox authorization modal
        openSandboxModal(order, gatewayData, shippingDetails);
      }

    } catch (err) {
      console.error('[Checkout Error]:', err);
      if (errorAlert) {
        errorAlert.textContent = err.message || 'An error occurred during checkout. Please try again.';
        errorAlert.style.display = 'block';
      }
      payBtn.disabled = false;
      payBtn.querySelector('.pay-btn-label').textContent = originalLabel;
    }
  });
}

function openSandboxModal(order, gatewayData, shippingDetails) {
  const modal = document.getElementById('checkoutPaymentModal');
  const content = document.getElementById('checkoutSandboxContent');
  if (!modal || !content) return;

  const payable = order.approved_payable_amount || order.reference_total_amount;

  content.innerHTML = `
    <div style="background:#F9FAFB; border:1px solid #E5E7EB; border-radius:6px; padding:1.25rem; margin-bottom:1.5rem;">
      <div style="font-size:0.75rem; font-weight:700; color:#0047AB; text-transform:uppercase; margin-bottom:4px;">Razorpay Gateway Sandbox Active</div>
      <div style="font-size:1.75rem; font-weight:700; color:#1A1A1A; font-family:var(--font-serif); margin-bottom:0.5rem;">
        ₹${payable.toLocaleString('en-IN')} INR
      </div>
      <div style="font-size:0.8rem; color:#4B5563; line-height:1.45;">
        Order Ref: <strong>${order.id}</strong><br>
        Razorpay Order ID: <strong>${gatewayData.razorpay_order_id}</strong><br>
        Deliver To: <strong>${escapeHtml(shippingDetails.fullName)}</strong>, ${escapeHtml(shippingDetails.city)}
      </div>
    </div>

    <p style="font-size:0.825rem; color:#6B7280; line-height:1.45; margin-bottom:1.5rem;">
      Modish7 is configured with verified Razorpay payment signature verification. 
      In this test mode, click below to simulate authentic HMAC signature verification and generate an official GST tax invoice.
    </p>

    <button type="button" class="btn btn-primary auth-btn-lime btn-block" id="simulateSandboxPayBtn" style="padding:1rem;">
      AUTHORIZE &amp; VERIFY ₹${payable.toLocaleString('en-IN')} PAYMENT
    </button>
  `;

  modal.classList.add('is-open');

  document.getElementById('simulateSandboxPayBtn').onclick = async function() {
    this.disabled = true;
    this.textContent = 'VERIFYING PAYMENT SIGNATURE...';

    const testPaymentId = 'pay_sb_' + Math.floor(10000000 + Math.random() * 90000000);
    const testSignature = 'sig_test_' + Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);

    await verifyPayment({
      orderId: order.id,
      razorpay_order_id: gatewayData.razorpay_order_id,
      razorpay_payment_id: testPaymentId,
      razorpay_signature: testSignature
    }, order, shippingDetails);

    modal.classList.remove('is-open');
  };
}

async function verifyPayment(verifyPayload, order, shippingDetails) {
  try {
    const res = await Auth.authFetch('/api/payments/verify', {
      method: 'POST',
      body: JSON.stringify(verifyPayload)
    });

    const data = await res.json();

    if (!data.success) {
      throw new Error(data.error || 'Payment signature verification failed.');
    }

    // Success! Clear cart
    CartManager.clear();
    currentInvoiceData = data.invoice;

    // Show confirmation
    showOrderSuccess(data.order, verifyPayload, data.invoice);

  } catch (err) {
    alert(err.message || 'Error verifying payment signature on server.');
    const payBtn = document.getElementById('proceedToPayBtn');
    if (payBtn) {
      payBtn.disabled = false;
      payBtn.querySelector('.pay-btn-label').textContent = 'PROCEED TO SECURE PAYMENT →';
    }
  }
}

function showOrderSuccess(order, paymentInfo, invoice) {
  const activeLayout = document.getElementById('checkoutActiveLayout');
  const successView = document.getElementById('checkoutSuccessView');
  const crumbPayment = document.getElementById('crumbPayment');

  if (activeLayout) activeLayout.style.display = 'none';
  if (successView) successView.style.display = 'block';
  if (crumbPayment) crumbPayment.classList.add('is-active', 'is-complete');

  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Populate Meta
  document.getElementById('confirmOrderId').textContent = order.id;
  document.getElementById('confirmPaymentId').textContent = paymentInfo.razorpay_payment_id;
  document.getElementById('confirmTotalPaid').textContent = `₹${(order.approved_payable_amount || order.reference_total_amount).toLocaleString('en-IN')}`;
  document.getElementById('confirmTrackingNumber').textContent = order.tracking_number || 'MOD7-EXP-CONFIRMED';

  // Populate items
  const itemsBox = document.getElementById('confirmItemsBox');
  if (itemsBox) {
    itemsBox.innerHTML = `
      <div style="font-size:0.75rem; font-weight:700; text-transform:uppercase; color:#0047AB; margin-bottom:0.75rem;">Verified Order Items</div>
      <div style="display:flex; flex-direction:column; gap:0.5rem;">
        ${(order.items || []).map(i => `
          <div style="display:flex; justify-content:space-between; font-size:0.875rem;">
            <span><strong>${i.quantity}x</strong> ${escapeHtml(i.product_name)}</span>
            <span>₹${(i.subtotal).toLocaleString('en-IN')}</span>
          </div>
        `).join('')}
        ${order.gift_item ? `
          <div style="display:flex; justify-content:space-between; font-size:0.875rem; color:#16A34A; font-weight:600;">
            <span>🎁 ${escapeHtml(order.gift_item)}</span>
            <span>FREE</span>
          </div>
        ` : ''}
      </div>
    `;
  }

  // View Invoice button
  const viewInvoiceBtn = document.getElementById('confirmViewInvoiceBtn');
  if (viewInvoiceBtn) {
    viewInvoiceBtn.onclick = () => renderInvoiceModal(order.id);
  }
}

async function renderInvoiceModal(orderId) {
  try {
    const res = await Auth.authFetch(`/api/invoices/${orderId}`);
    const data = await res.json();
    if (!data.success) {
      alert('Unable to retrieve tax invoice.');
      return;
    }

    const { invoice, order, items, salon } = data;
    const modal = document.getElementById('checkoutInvoiceModal');
    const content = document.getElementById('checkoutInvoiceContent');
    if (!modal || !content) return;

    const issueDate = new Date(invoice.issued_at).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });

    content.innerHTML = `
      <div class="invoice-box" style="font-family:var(--font-sans); padding:1.5rem; color:#1A1A1A;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #0047AB; padding-bottom:1rem; margin-bottom:1.5rem;">
          <div>
            <h2 style="font-family:var(--font-serif); font-size:1.75rem; color:#0047AB; margin:0 0 4px 0;">MODISH7</h2>
            <div style="font-size:0.75rem; text-transform:uppercase; letter-spacing:0.05em; color:#666;">Tax Invoice / Salon Supply Bill</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:0.9rem; font-weight:700;">Invoice No: ${invoice.invoice_number}</div>
            <div style="font-size:0.75rem; color:#666;">Date: ${issueDate}</div>
            <div style="font-size:0.75rem; color:#666;">Order ID: ${order.id}</div>
          </div>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:1.5rem; margin-bottom:1.5rem; font-size:0.8rem; line-height:1.45;">
          <div>
            <strong>Supplier:</strong><br>
            Modish7 Haircare India Private Limited<br>
            Direct Salon Supply Desk<br>
            GSTIN: 27AABCM0707Q1Z8<br>
            support@modish7.com
          </div>
          <div>
            <strong>Billed &amp; Shipped To:</strong><br>
            ${escapeHtml(order.shipping_name || salon.full_name)}<br>
            ${order.shipping_business_name ? escapeHtml(order.shipping_business_name) + '<br>' : ''}
            ${escapeHtml(order.shipping_address || salon.business_address || 'Salon Address')}<br>
            ${escapeHtml(order.shipping_city || salon.city)}, ${escapeHtml(order.shipping_state || salon.state)} ${order.shipping_pincode || salon.pincode || ''}<br>
            Phone: ${escapeHtml(order.shipping_phone || salon.phone)}
          </div>
        </div>

        <table style="width:100%; border-collapse:collapse; font-size:0.8rem; margin-bottom:1.5rem;">
          <thead>
            <tr style="background:#F3F4F6; text-align:left;">
              <th style="padding:8px; border:1px solid #E5E7EB;">Item Description</th>
              <th style="padding:8px; border:1px solid #E5E7EB; text-align:center;">Qty</th>
              <th style="padding:8px; border:1px solid #E5E7EB; text-align:right;">Unit Rate</th>
              <th style="padding:8px; border:1px solid #E5E7EB; text-align:right;">Amount (INR)</th>
            </tr>
          </thead>
          <tbody>
            ${items.map(i => `
              <tr>
                <td style="padding:8px; border:1px solid #E5E7EB;">${escapeHtml(i.product_name)}</td>
                <td style="padding:8px; border:1px solid #E5E7EB; text-align:center;">${i.quantity}</td>
                <td style="padding:8px; border:1px solid #E5E7EB; text-align:right;">₹${i.unit_reference_price.toLocaleString('en-IN')}</td>
                <td style="padding:8px; border:1px solid #E5E7EB; text-align:right;">₹${(i.subtotal).toLocaleString('en-IN')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div style="display:flex; justify-content:flex-end; margin-bottom:1.5rem;">
          <div style="width:260px; font-size:0.8rem; line-height:1.6;">
            <div style="display:flex; justify-content:space-between;">
              <span>Taxable Value:</span>
              <strong>₹${invoice.amount_taxable.toLocaleString('en-IN')}</strong>
            </div>
            <div style="display:flex; justify-content:space-between;">
              <span>CGST (9%):</span>
              <strong>₹${invoice.cgst_amount.toLocaleString('en-IN')}</strong>
            </div>
            <div style="display:flex; justify-content:space-between;">
              <span>SGST (9%):</span>
              <strong>₹${invoice.sgst_amount.toLocaleString('en-IN')}</strong>
            </div>
            <div style="display:flex; justify-content:space-between; border-top:1px solid #1A1A1A; margin-top:4px; padding-top:4px; font-size:0.95rem; font-weight:700;">
              <span>Grand Total:</span>
              <span style="color:#0047AB;">₹${invoice.total_amount.toLocaleString('en-IN')}</span>
            </div>
          </div>
        </div>

        <div style="text-align:center; margin-top:2rem;">
          <button type="button" class="btn btn-secondary btn-sm" onclick="window.print()">Print Official Invoice</button>
        </div>
      </div>
    `;

    modal.classList.add('is-open');
  } catch (err) {
    alert('Error fetching invoice.');
  }
}

function initModals() {
  const closePay = document.getElementById('closePaymentModalBtn');
  const payModal = document.getElementById('checkoutPaymentModal');
  if (closePay && payModal) {
    closePay.onclick = () => payModal.classList.remove('is-open');
  }

  const closeInv = document.getElementById('closeInvoiceModalBtn');
  const invModal = document.getElementById('checkoutInvoiceModal');
  if (closeInv && invModal) {
    closeInv.onclick = () => invModal.classList.remove('is-open');
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
