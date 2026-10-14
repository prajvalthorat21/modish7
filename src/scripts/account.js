import { Auth } from './auth.js';

let currentSalon = null;
let currentProducts = [];
let currentOrders = [];

document.addEventListener('DOMContentLoaded', async () => {
  // Authentication Guard: Redirect to /login if not authenticated
  if (!Auth.isAuthenticated()) {
    window.location.href = '/login?expired=1';
    return;
  }

  currentSalon = await Auth.fetchMe();
  if (!currentSalon) {
    window.location.href = '/login?expired=1';
    return;
  }

  initHeaderUI();
  initTabs();
  initModals();
  renderProfile();
  initProfileForm();
  renderSecurity();
  initSecurityForm();
  await loadProducts();
  await loadOrders();
  initOrderForm();
});

function initModals() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.portal-modal-backdrop.is-open').forEach(m => m.classList.remove('is-open'));
    }
  });

  document.querySelectorAll('.portal-modal-backdrop').forEach(backdrop => {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        backdrop.classList.remove('is-open');
      }
    });
  });
}

function initHeaderUI() {
  const salonNameEl = document.getElementById('dashSalonName');
  const contactNameEl = document.getElementById('dashContactName');
  const salonCityEl = document.getElementById('dashSalonCity');
  const logoutBtn = document.getElementById('logoutBtn');

  if (salonNameEl) salonNameEl.textContent = currentSalon.business_name;
  if (contactNameEl) contactNameEl.textContent = currentSalon.full_name;
  if (salonCityEl) salonCityEl.textContent = currentSalon.city;

  if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (confirm('Are you sure you want to log out of your salon partner portal?')) {
        Auth.logout();
      }
    });
  }
}

function initTabs() {
  const tabs = document.querySelectorAll('.dashboard-tab');
  const views = document.querySelectorAll('.dashboard-view');

  function switchTab(target) {
    tabs.forEach(t => t.classList.toggle('is-active', t.dataset.view === target));
    views.forEach(v => v.classList.toggle('is-active', v.id === `view-${target}`));
  }

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.view;
      switchTab(target);
      window.location.hash = target;
    });
  });

  // Handle direct hash navigation (#profile, #security, #orders, #catalogue)
  const initialHash = window.location.hash.replace('#', '');
  if (initialHash && ['orders', 'catalogue', 'profile', 'security'].includes(initialHash)) {
    switchTab(initialHash);
  }
}

function renderProfile() {
  if (!currentSalon) return;
  document.getElementById('profFullName').value = currentSalon.full_name || '';
  document.getElementById('profBusinessName').value = currentSalon.business_name || '';
  document.getElementById('profEmail').value = currentSalon.email || '';
  document.getElementById('profPhone').value = currentSalon.phone || '';
  document.getElementById('profCity').value = currentSalon.city || '';
  document.getElementById('profState').value = currentSalon.state || '';
  document.getElementById('profGstin').value = currentSalon.gstin || '';
  document.getElementById('profBusinessAddress').value = currentSalon.business_address || '';
  document.getElementById('profBillingAddress').value = currentSalon.billing_address || '';
}

function initProfileForm() {
  const form = document.getElementById('profileForm');
  const alertEl = document.getElementById('profileAlert');

  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (alertEl) alertEl.style.display = 'none';

    const payload = {
      fullName: document.getElementById('profFullName').value.trim(),
      businessName: document.getElementById('profBusinessName').value.trim(),
      phone: document.getElementById('profPhone').value.trim(),
      city: document.getElementById('profCity').value.trim(),
      state: document.getElementById('profState').value.trim(),
      gstin: document.getElementById('profGstin').value.trim(),
      businessAddress: document.getElementById('profBusinessAddress').value.trim(),
      billingAddress: document.getElementById('profBillingAddress').value.trim()
    };

    const submitBtn = document.getElementById('saveProfileBtn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'SAVING CHANGES...';

    try {
      const res = await Auth.authFetch('/api/profile', {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        currentSalon = data.profile;
        initHeaderUI();
        alertEl.textContent = 'Salon business profile updated successfully.';
        alertEl.className = 'auth-alert auth-alert-success';
        alertEl.style.display = 'block';
      } else {
        alertEl.textContent = data.error || 'Failed to update profile.';
        alertEl.className = 'auth-alert auth-alert-error';
        alertEl.style.display = 'block';
      }
    } catch {
      alertEl.textContent = 'Network error saving profile.';
      alertEl.className = 'auth-alert auth-alert-error';
      alertEl.style.display = 'block';
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'SAVE PROFILE CHANGES';
    }
  });
}

function renderSecurity() {
  if (!currentSalon) return;
  const authProviderLabel = document.getElementById('authProviderLabel');
  const accountIdDisplay = document.getElementById('accountIdDisplay');
  const currentPasswordWrap = document.getElementById('currentPasswordFieldWrap');

  if (accountIdDisplay) accountIdDisplay.textContent = currentSalon.id;

  if (authProviderLabel) {
    if (currentSalon.auth_provider === 'google') {
      authProviderLabel.innerHTML = '<span style="display:inline-flex;align-items:center;gap:6px;"><svg width="14" height="14" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/></svg> Google Account</span>';
      if (currentPasswordWrap) currentPasswordWrap.style.display = 'none';
    } else {
      authProviderLabel.textContent = 'Email & Password';
      if (currentPasswordWrap) currentPasswordWrap.style.display = 'block';
    }
  }
}

function initSecurityForm() {
  const form = document.getElementById('changePasswordForm');
  const alertEl = document.getElementById('securityAlert');

  // Password visibility toggle helpers
  ['toggleCurrentPasswordBtn', 'toggleNewPasswordBtn', 'toggleConfirmNewPasswordBtn'].forEach(id => {
    const btn = document.getElementById(id);
    if (!btn) return;
    const input = btn.previousElementSibling;
    if (!input) return;

    btn.addEventListener('click', () => {
      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';
      btn.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
      const eyeOpen = btn.querySelector('.eye-open');
      const eyeClosed = btn.querySelector('.eye-closed');
      if (eyeOpen && eyeClosed) {
        eyeOpen.style.display = isPassword ? 'none' : 'block';
        eyeClosed.style.display = isPassword ? 'block' : 'none';
      }
    });
  });

  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (alertEl) alertEl.style.display = 'none';

    const currentPassword = document.getElementById('currentPassword')?.value || '';
    const newPassword = document.getElementById('newPassword').value;
    const confirmNewPassword = document.getElementById('confirmNewPassword').value;
    const submitBtn = document.getElementById('changePasswordBtn');

    if (newPassword.length < 8) {
      if (alertEl) {
        alertEl.textContent = 'New password must be at least 8 characters long.';
        alertEl.className = 'auth-alert auth-alert-error';
        alertEl.style.display = 'block';
      }
      return;
    }

    if (newPassword !== confirmNewPassword) {
      if (alertEl) {
        alertEl.textContent = 'New passwords do not match. Please verify.';
        alertEl.className = 'auth-alert auth-alert-error';
        alertEl.style.display = 'block';
      }
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'UPDATING...';

    try {
      const res = await Auth.changePassword(currentPassword, newPassword);
      if (res.success) {
        form.reset();
        if (alertEl) {
          alertEl.textContent = res.message || 'Password updated successfully.';
          alertEl.className = 'auth-alert auth-alert-success';
          alertEl.style.display = 'block';
        }
      } else {
        if (alertEl) {
          alertEl.textContent = res.error || 'Failed to update password.';
          alertEl.className = 'auth-alert auth-alert-error';
          alertEl.style.display = 'block';
        }
      }
    } catch (err) {
      if (alertEl) {
        alertEl.textContent = 'Network error updating password. Please try again.';
        alertEl.className = 'auth-alert auth-alert-error';
        alertEl.style.display = 'block';
      }
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'UPDATE PASSWORD';
    }
  });
}

async function loadProducts() {
  try {
    const res = await fetch('/api/products');
    const data = await res.json();
    if (data.success && data.products) {
      currentProducts = data.products;
      renderCatalogue(data.products);
    }
  } catch (err) {
    console.error('Error loading products:', err);
  }
}

function renderCatalogue(products) {
  const container = document.getElementById('orderProductsContainer');
  if (!container) return;

  container.innerHTML = products.map(p => `
    <div class="portal-product-card" data-product-id="${p.id}" data-price="${p.reference_offer_price}">
      <img src="${p.image_url}" alt="${p.name}" class="portal-product-img">
      <div class="portal-product-info">
        <div class="portal-product-cat">${p.category} · ${p.size}</div>
        <h4 class="portal-product-title">${p.name}</h4>
        <div class="portal-product-pricing">
          Reference Offer: <strong>₹${p.reference_offer_price.toLocaleString('en-IN')}</strong> 
          <span style="font-size:0.75rem; color:var(--portal-charcoal-muted); text-decoration:line-through; margin-left:4px;">MRP ₹${p.mrp.toLocaleString('en-IN')}</span>
        </div>
      </div>
      <div>
        <label style="display:block; font-size:0.7rem; font-weight:700; text-transform:uppercase; margin-bottom:4px; color:var(--portal-charcoal-muted);">Qty (Units)</label>
        <input type="number" min="0" value="0" class="portal-product-qty product-qty-input" data-id="${p.id}" aria-label="Quantity for ${p.name}">
      </div>
    </div>
  `).join('');

  // Attach quantity change listeners
  container.querySelectorAll('.product-qty-input').forEach(input => {
    input.addEventListener('input', calculateOrderTotal);
  });
}

function calculateOrderTotal() {
  let total = 0;
  let itemCount = 0;
  const inputs = document.querySelectorAll('.product-qty-input');

  inputs.forEach(input => {
    const qty = parseInt(input.value, 10) || 0;
    if (qty > 0) {
      const card = input.closest('.portal-product-card');
      const price = parseInt(card.dataset.price, 10);
      total += price * qty;
      itemCount += qty;
    }
  });

  const totalEl = document.getElementById('orderReferenceTotal');
  const countEl = document.getElementById('orderItemsCount');
  if (totalEl) totalEl.textContent = `₹${total.toLocaleString('en-IN')}`;
  if (countEl) countEl.textContent = `${itemCount} units`;
}

function initOrderForm() {
  const form = document.getElementById('createOrderForm');
  const alertEl = document.getElementById('orderAlert');

  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (alertEl) alertEl.style.display = 'none';

    const items = [];
    document.querySelectorAll('.product-qty-input').forEach(input => {
      const qty = parseInt(input.value, 10) || 0;
      if (qty > 0) {
        items.push({
          productId: input.dataset.id,
          quantity: qty
        });
      }
    });

    if (items.length === 0) {
      if (alertEl) {
        alertEl.textContent = 'Please select at least 1 product quantity for your order request.';
        alertEl.className = 'auth-alert auth-alert-error';
        alertEl.style.display = 'block';
      }
      return;
    }

    const notes = document.getElementById('orderNotes').value.trim();
    const submitBtn = document.getElementById('submitOrderBtn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'SUBMITTING ORDER REQUEST...';

    try {
      const res = await Auth.authFetch('/api/orders', {
        method: 'POST',
        body: JSON.stringify({ items, notes })
      });
      const data = await res.json();
      if (data.success) {
        // Reset form
        document.querySelectorAll('.product-qty-input').forEach(i => i.value = 0);
        document.getElementById('orderNotes').value = '';
        calculateOrderTotal();

        alertEl.textContent = 'Order request submitted successfully. Our commercial team will review and approve your quotation.';
        alertEl.className = 'auth-alert auth-alert-success';
        alertEl.style.display = 'block';

        // Reload orders and switch to orders tab
        await loadOrders();
        setTimeout(() => {
          document.querySelector('[data-view="orders"]')?.click();
        }, 1200);
      } else {
        alertEl.textContent = data.error || 'Failed to submit order request.';
        alertEl.className = 'auth-alert auth-alert-error';
        alertEl.style.display = 'block';
      }
    } catch {
      alertEl.textContent = 'Network error submitting order.';
      alertEl.className = 'auth-alert auth-alert-error';
      alertEl.style.display = 'block';
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'SUBMIT ORDER REQUEST FOR COMMERCIAL APPROVAL';
    }
  });
}

async function loadOrders() {
  try {
    const res = await Auth.authFetch('/api/orders');
    const data = await res.json();
    if (data.success && data.orders) {
      currentOrders = data.orders;
      updateStats(data.orders);
      renderOrdersList(data.orders);
    }
  } catch (err) {
    console.error('Error loading orders:', err);
  }
}

function updateStats(orders) {
  const totalOrdersEl = document.getElementById('statTotalOrders');
  const pendingOrdersEl = document.getElementById('statPendingOrders');
  const approvedOrdersEl = document.getElementById('statApprovedOrders');
  const paidOrdersEl = document.getElementById('statPaidOrders');

  if (totalOrdersEl) totalOrdersEl.textContent = orders.length;
  if (pendingOrdersEl) pendingOrdersEl.textContent = orders.filter(o => o.status === 'PENDING_REVIEW').length;
  if (approvedOrdersEl) approvedOrdersEl.textContent = orders.filter(o => o.status === 'QUOTATION_APPROVED').length;
  if (paidOrdersEl) paidOrdersEl.textContent = orders.filter(o => o.status === 'PAID').length;
}

function renderOrdersList(orders) {
  const container = document.getElementById('ordersListContainer');
  if (!container) return;

  if (orders.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 3rem 1rem; background: var(--portal-card-bg); border: 1px solid var(--portal-border); border-radius: 4px;">
        <h4 style="font-family: var(--font-serif); font-size: 1.5rem; margin-bottom: 0.5rem;">No Salon Order Requests Yet</h4>
        <p style="color: var(--portal-charcoal-muted); font-size: 0.875rem; margin-bottom: 1.5rem;">Select products and quantities from the catalogue to submit your first commercial supply request.</p>
        <button class="btn btn-primary btn-sm" onclick="document.querySelector('[data-view=\\'catalogue\\']')?.click()">BROWSE PRODUCTS &amp; ORDER</button>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="portal-table-wrap">
      <table class="portal-table">
        <thead>
          <tr>
            <th>Order Ref &amp; Date</th>
            <th>Items Requested</th>
            <th>Status</th>
            <th>Payable Amount</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${orders.map(order => {
            let statusBadge = '';
            let actionBtn = '';

            if (order.status === 'PENDING_REVIEW') {
              statusBadge = `<span class="status-badge status-pending">Commercial Review</span>`;
              actionBtn = `
                <button class="btn btn-secondary btn-sm" style="font-size:0.75rem; padding: 0.4rem 0.8rem;" onclick="window.simulateApproval('${order.id}')" title="Simulate Commercial Team Review &amp; Quotation Approval">
                  Simulate Approval
                </button>
              `;
            } else if (order.status === 'QUOTATION_APPROVED' || order.status === 'PAYMENT_PENDING') {
              statusBadge = `<span class="status-badge status-approved">Quotation Approved</span>`;
              actionBtn = `
                <button class="btn btn-primary btn-sm auth-btn-lime" style="font-size:0.75rem; padding: 0.4rem 0.8rem;" onclick="window.startPayment('${order.id}')">
                  PAY ONLINE
                </button>
              `;
            } else if (order.status === 'PAID') {
              statusBadge = `<span class="status-badge status-paid">Paid &amp; Confirmed</span>`;
              actionBtn = `
                <button class="btn btn-secondary btn-sm" style="font-size:0.75rem; padding: 0.4rem 0.8rem;" onclick="window.openInvoice('${order.id}')">
                  VIEW INVOICE
                </button>
              `;
            }

            const itemsSummary = (order.items || []).map(i => `${i.product_name} (${i.quantity}x)`).join('<br>');
            const displayAmount = order.approved_payable_amount || order.reference_total_amount;
            const formattedDate = new Date(order.created_at).toLocaleDateString('en-IN', {
              day: 'numeric',
              month: 'short',
              year: 'numeric'
            });

            return `
              <tr>
                <td>
                  <strong>${order.id}</strong><br>
                  <small style="color:var(--portal-charcoal-muted);">${formattedDate}</small>
                </td>
                <td style="font-size:0.8rem; line-height:1.4;">${itemsSummary}</td>
                <td>${statusBadge}</td>
                <td>
                  <strong style="font-size:0.95rem;">₹${displayAmount.toLocaleString('en-IN')}</strong>
                  ${order.status === 'QUOTATION_APPROVED' ? '<br><small style="color:var(--portal-cobalt); font-weight:600;">Confirmed Rate</small>' : '<br><small style="color:var(--portal-charcoal-muted);">Ref Total</small>'}
                </td>
                <td>${actionBtn}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ------------------------------------------------------------------------------
// GLOBAL ACTIONS: QUOTATION APPROVAL SIMULATION, PAYMENT & INVOICE
// ------------------------------------------------------------------------------

window.simulateApproval = async function(orderId) {
  try {
    const res = await Auth.authFetch(`/api/orders/${orderId}/approve-quotation`, {
      method: 'POST'
    });
    const data = await res.json();
    if (data.success) {
      alert(`Quotation ${data.order.quotation_ref} approved! Payable amount: ₹${data.order.approved_payable_amount.toLocaleString('en-IN')}. Ready for payment.`);
      await loadOrders();
    } else {
      alert(data.error || 'Failed to approve quotation.');
    }
  } catch (err) {
    alert('Error connecting to backend.');
  }
};

window.startPayment = async function(orderId) {
  try {
    const res = await Auth.authFetch('/api/payments/create-order', {
      method: 'POST',
      body: JSON.stringify({ orderId })
    });
    const data = await res.json();

    if (!data.success) {
      alert(data.error || 'Failed to initiate payment.');
      return;
    }

    const { gatewayData, amount, currency } = data;

    // Check if live Razorpay SDK is available
    if (gatewayData.is_live && window.Razorpay) {
      const options = {
        key: gatewayData.key_id,
        amount: gatewayData.amount,
        currency: gatewayData.currency,
        name: 'Modish7 Professional Haircare',
        description: `Salon Supply Order ${orderId}`,
        image: '/favicon.png',
        order_id: gatewayData.razorpay_order_id,
        handler: async function(response) {
          await verifyPaymentOnServer(orderId, response);
        },
        prefill: {
          name: currentSalon.full_name,
          email: currentSalon.email,
          contact: currentSalon.phone
        },
        theme: {
          color: '#0047AB'
        }
      };
      const rzp = new window.Razorpay(options);
      rzp.open();
    } else {
      // Sandbox Simulator Modal
      openPaymentSandboxModal(orderId, gatewayData, amount, currency);
    }
  } catch (err) {
    console.error('Payment initiation error:', err);
    alert('Error initiating online payment gateway.');
  }
};

function openPaymentSandboxModal(orderId, gatewayData, amount, currency) {
  const modal = document.getElementById('paymentModal');
  const detailsEl = document.getElementById('payModalDetails');
  if (!modal || !detailsEl) return;

  detailsEl.innerHTML = `
    <div style="background:var(--portal-surface); border:1px solid var(--portal-border); border-radius:4px; padding:1.25rem; margin-bottom:1.5rem;">
      <div style="font-size:0.75rem; font-weight:700; color:var(--portal-cobalt); text-transform:uppercase; margin-bottom:4px;">Razorpay Gateway Sandbox</div>
      <div style="font-size:1.5rem; font-weight:700; color:var(--portal-charcoal); margin-bottom:0.5rem;">₹${amount.toLocaleString('en-IN')} ${currency}</div>
      <div style="font-size:0.8rem; color:var(--portal-charcoal-muted); line-height:1.4;">
        Order Ref: <strong>${orderId}</strong><br>
        Razorpay Order ID: <strong>${gatewayData.razorpay_order_id}</strong><br>
        Billed To: <strong>${currentSalon.business_name}</strong> (${currentSalon.email})
      </div>
    </div>
    <p style="font-size:0.825rem; color:var(--portal-charcoal-muted); margin-bottom:1.5rem; line-height:1.45;">
      In live production, Razorpay Checkout securely accepts UPI (Google Pay, PhonePe, Paytm), Net Banking, and Corporate Cards. 
      In this verified sandbox mode, you can confirm authentic cryptographic signature verification and GST invoice issuance right now.
    </p>
    <button class="auth-btn-primary auth-btn-lime" id="confirmSandboxPayBtn" style="width:100%;">
      AUTHORIZE &amp; VERIFY ₹${amount.toLocaleString('en-IN')} PAYMENT
    </button>
  `;

  modal.classList.add('is-open');

  document.getElementById('confirmSandboxPayBtn').onclick = async function() {
    this.disabled = true;
    this.textContent = 'VERIFYING SIGNATURE SERVER-SIDE...';

    const testPaymentId = 'pay_sb_' + Math.floor(10000000 + Math.random() * 90000000);
    const testSignature = 'sig_test_' + Math.random().toString(36).substring(2);

    await verifyPaymentOnServer(orderId, {
      razorpay_order_id: gatewayData.razorpay_order_id,
      razorpay_payment_id: testPaymentId,
      razorpay_signature: testSignature
    });

    modal.classList.remove('is-open');
  };
}

async function verifyPaymentOnServer(orderId, response) {
  try {
    const res = await Auth.authFetch('/api/payments/verify', {
      method: 'POST',
      body: JSON.stringify({
        orderId,
        razorpay_order_id: response.razorpay_order_id,
        razorpay_payment_id: response.razorpay_payment_id,
        razorpay_signature: response.razorpay_signature
      })
    });
    const data = await res.json();

    if (data.success) {
      alert('Payment verified successfully! Official B2B Tax Invoice generated.');
      await loadOrders();
      window.openInvoice(orderId);
    } else {
      alert(data.error || 'Payment signature verification failed.');
    }
  } catch (err) {
    alert('Error verifying payment on server.');
  }
}

window.openInvoice = async function(orderId) {
  try {
    const res = await Auth.authFetch(`/api/invoices/${orderId}`);
    const data = await res.json();

    if (!data.success) {
      alert('Unable to load invoice.');
      return;
    }

    const { invoice, order, items, salon } = data;
    const modal = document.getElementById('invoiceModal');
    const contentEl = document.getElementById('invoiceModalContent');

    const issueDate = new Date(invoice.issued_at).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    contentEl.innerHTML = `
      <div class="invoice-container" id="printableInvoice">
        <div class="invoice-header-grid">
          <div>
            <div style="font-family:var(--font-serif); font-size:1.75rem; font-weight:700; color:var(--portal-charcoal);">Modish7 Haircare Pvt. Ltd.</div>
            <div style="font-size:0.75rem; color:var(--portal-cobalt); font-weight:700; letter-spacing:0.12em; text-transform:uppercase;">Salon Exclusive Distribution</div>
            <div style="font-size:0.8rem; color:var(--portal-charcoal-muted); margin-top:4px;">GSTIN: 27AABCM7777M1Z5</div>
            <div style="font-size:0.8rem; color:var(--portal-charcoal-muted);">Support: support@modish7.com | +91 91753 11884</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:1.25rem; font-weight:700; color:var(--portal-charcoal);">${invoice.invoice_number}</div>
            <div style="font-size:0.8rem; color:var(--portal-charcoal-muted);">Date: ${issueDate}</div>
            <div style="font-size:0.8rem; color:var(--portal-charcoal-muted);">Order: ${order.id}</div>
            <div style="display:inline-block; margin-top:6px; padding:2px 8px; background:#D1FAE5; color:#065F46; font-size:0.7rem; font-weight:700; border-radius:2px;">TAX INVOICE · PAID</div>
          </div>
        </div>

        <div class="invoice-party-grid">
          <div>
            <div style="font-size:0.75rem; font-weight:700; text-transform:uppercase; color:var(--portal-charcoal-muted); margin-bottom:4px;">Billed To (Salon Partner):</div>
            <div style="font-weight:700; font-size:1rem;">${salon.business_name}</div>
            <div style="font-size:0.85rem; color:var(--portal-charcoal);">Attn: ${salon.full_name}</div>
            <div style="font-size:0.85rem; color:var(--portal-charcoal);">${salon.business_address || salon.city}</div>
            <div style="font-size:0.85rem; color:var(--portal-charcoal);">GSTIN: ${salon.gstin || 'Unregistered / Retail'}</div>
            <div style="font-size:0.85rem; color:var(--portal-charcoal);">Phone: ${salon.phone}</div>
          </div>
          <div>
            <div style="font-size:0.75rem; font-weight:700; text-transform:uppercase; color:var(--portal-charcoal-muted); margin-bottom:4px;">Payment Reference:</div>
            <div style="font-size:0.85rem;">Gateway: <strong>RAZORPAY</strong></div>
            <div style="font-size:0.85rem;">Payment ID: <strong>${order.razorpay_payment_id || 'N/A'}</strong></div>
            <div style="font-size:0.85rem;">Status: <strong>Confirmed &amp; Dispatched</strong></div>
            <div style="font-size:0.85rem;">Logistics AWB: <strong>${order.tracking_number || 'MOD7-EXP-TRACK'}</strong></div>
          </div>
        </div>

        <table class="invoice-items-table">
          <thead>
            <tr style="text-align:left; font-size:0.75rem; color:var(--portal-charcoal-muted); text-transform:uppercase;">
              <th>Description</th>
              <th style="text-align:center;">Qty</th>
              <th style="text-align:right;">Rate (₹)</th>
              <th style="text-align:right;">Amount (₹)</th>
            </tr>
          </thead>
          <tbody>
            ${items.map(i => `
              <tr>
                <td>${i.product_name}</td>
                <td style="text-align:center;">${i.quantity}</td>
                <td style="text-align:right;">₹${i.unit_reference_price.toLocaleString('en-IN')}</td>
                <td style="text-align:right;">₹${i.subtotal.toLocaleString('en-IN')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="invoice-totals">
          <div style="display:flex; justify-content:space-between; font-size:0.85rem;">
            <span>Taxable Value:</span>
            <span>₹${invoice.amount_taxable.toLocaleString('en-IN')}</span>
          </div>
          <div style="display:flex; justify-content:space-between; font-size:0.85rem;">
            <span>CGST (9%):</span>
            <span>₹${invoice.cgst_amount.toLocaleString('en-IN')}</span>
          </div>
          <div style="display:flex; justify-content:space-between; font-size:0.85rem;">
            <span>SGST (9%):</span>
            <span>₹${invoice.sgst_amount.toLocaleString('en-IN')}</span>
          </div>
          <div style="display:flex; justify-content:space-between; font-weight:700; font-size:1.1rem; border-top:1px solid #E5E7EB; padding-top:6px;">
            <span>Total Payable:</span>
            <span>₹${invoice.total_amount.toLocaleString('en-IN')}</span>
          </div>
        </div>

        <div style="margin-top:2.5rem; padding-top:1.5rem; border-top:1px dashed #E5E7EB; font-size:0.75rem; color:var(--portal-charcoal-muted); text-align:center;">
          This is a computer-generated official commercial tax invoice for professional salon allocation. Zero retail distribution authorized.
        </div>
      </div>
      <div style="margin-top:1.5rem; display:flex; justify-content:flex-end; gap:1rem;">
        <button class="btn btn-secondary btn-sm" onclick="window.print()">PRINT INVOICE</button>
        <button class="btn btn-primary btn-sm" onclick="document.getElementById('invoiceModal').classList.remove('is-open')">CLOSE</button>
      </div>
    `;

    modal.classList.add('is-open');
  } catch (err) {
    console.error('Invoice load error:', err);
  }
};
