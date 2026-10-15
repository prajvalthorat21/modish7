/**
 * Modish7 Client Cart & Offer Management Engine
 * Handles client-side cart persistence, live item count sync,
 * automatic promotional offer evaluations (5% discount, Free Travel Pouch, Free Shipping),
 * and Cart Drawer UI interactions.
 */

const CART_KEY = 'modish7_b2b_cart';

export const KNOWN_PRODUCTS = {
  'shea-butter-combo': {
    id: 'shea-butter-combo',
    name: 'Shea Butter Shampoo + Conditioner Combo',
    size: '350ml + 350ml',
    price: 3230,
    mrp: 3400,
    imageUrl: '/assets/modish7/shea-butter-shampoo-conditioner.webp',
    category: 'Signature Duo'
  },
  'mks-eco-detangler': {
    id: 'mks-eco-detangler',
    name: 'MKS eco Leave-In & Detangler',
    size: '118ml',
    price: 2089,
    mrp: 2199,
    imageUrl: '/assets/modish7/mks-eco-leave-in-detangler.webp',
    category: 'Leave-In Care'
  },
  'shea-butter-conditioner': {
    id: 'shea-butter-conditioner',
    name: 'Shea Butter Conditioner',
    size: '350ml',
    price: 1615,
    mrp: 1700,
    imageUrl: '/assets/modish7/shea-butter-conditioner.webp',
    category: 'Conditioning Care'
  },
  'anti-dandruff-shampoo': {
    id: 'anti-dandruff-shampoo',
    name: 'Anti-Dandruff Shampoo',
    size: '350ml',
    price: 1615,
    mrp: 1700,
    imageUrl: '/assets/modish7/anti-dandruff-shampoo.webp',
    category: 'Clarifying Care'
  }
};

export class CartManager {
  static getItems() {
    try {
      const raw = localStorage.getItem(CART_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      // Sanitize items
      return parsed.filter(item => item && item.productId && item.quantity > 0 && KNOWN_PRODUCTS[item.productId]);
    } catch {
      return [];
    }
  }

  static saveItems(items) {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(items));
    } catch (e) {
      console.warn('[CartManager] LocalStorage error:', e);
    }
    this.notifyUpdate();
  }

  static addItem(productId, quantity = 1, openDrawer = true) {
    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty <= 0) return;

    const items = this.getItems();
    const existingIndex = items.findIndex(i => i.productId === productId);

    if (existingIndex >= 0) {
      items[existingIndex].quantity += qty;
    } else {
      items.push({ productId, quantity: qty });
    }

    this.saveItems(items);

    if (openDrawer) {
      this.openDrawer();
    }
  }

  static updateQuantity(productId, quantity) {
    const qty = parseInt(quantity, 10);
    let items = this.getItems();

    if (isNaN(qty) || qty <= 0) {
      items = items.filter(i => i.productId !== productId);
    } else {
      const item = items.find(i => i.productId === productId);
      if (item) {
        item.quantity = qty;
      }
    }

    this.saveItems(items);
  }

  static removeItem(productId) {
    const items = this.getItems().filter(i => i.productId !== productId);
    this.saveItems(items);
  }

  static clear() {
    try {
      localStorage.removeItem(CART_KEY);
    } catch {}
    this.notifyUpdate();
  }

  static getTotalCount() {
    const items = this.getItems();
    return items.reduce((acc, item) => acc + (parseInt(item.quantity, 10) || 0), 0);
  }

  /**
   * Fast synchronous client calculation matching official store promotional rules
   */
  static calculateSummary() {
    const items = this.getItems();
    let subtotal = 0;
    const itemDetails = [];

    for (const item of items) {
      const prod = KNOWN_PRODUCTS[item.productId];
      if (prod) {
        const itemSubtotal = prod.price * item.quantity;
        subtotal += itemSubtotal;
        itemDetails.push({
          ...prod,
          quantity: item.quantity,
          subtotal: itemSubtotal
        });
      }
    }

    // 1. Promotional Savings: 5% off orders >= 1,499
    const discountEligible = subtotal >= 1499;
    const discountAmount = discountEligible ? Math.round(subtotal * 0.05) : 0;

    // 2. Complimentary Gift: Travel Pouch worth ₹500 on qualifying orders >= 999
    const giftEligible = subtotal >= 999;
    const giftItem = giftEligible ? 'Complimentary Modish7 Travel Pouch (Value ₹500)' : '';

    // 3. Free Shipping: Free on orders >= 499 (else ₹99)
    const freeShipping = subtotal >= 499;
    const shippingFee = (subtotal === 0 || freeShipping) ? 0 : 99;

    const totalAmount = Math.max(0, subtotal - discountAmount + shippingFee);

    return {
      items: itemDetails,
      itemCount: this.getTotalCount(),
      subtotal,
      discountAmount,
      discountEligible,
      discountPercent: discountEligible ? 5 : 0,
      giftItem,
      giftEligible,
      freeShipping,
      shippingFee,
      totalAmount,
      currency: 'INR'
    };
  }

  /**
   * Asynchronous server calculation via /api/cart/validate
   */
  static async validateWithServer() {
    const items = this.getItems();
    try {
      const res = await fetch('/api/cart/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items })
      });
      const data = await res.json();
      if (data.success) {
        return data;
      }
    } catch (e) {
      console.warn('[CartManager] Server validation offline, using client fallback:', e);
    }
    return this.calculateSummary();
  }

  static notifyUpdate() {
    const summary = this.calculateSummary();
    this.updateBadges(summary.itemCount);
    this.renderDrawer(summary);

    window.dispatchEvent(new CustomEvent('cart:updated', {
      detail: summary
    }));
  }

  static updateBadges(count) {
    const badges = document.querySelectorAll('.cart-count-badge');
    badges.forEach(b => {
      b.textContent = count;
      if (count > 0) {
        b.classList.remove('is-hidden');
        b.style.display = 'inline-flex';
      } else {
        b.classList.add('is-hidden');
        b.style.display = 'none';
      }
    });
  }

  static openDrawer() {
    const drawer = document.getElementById('cartDrawer');
    const backdrop = document.getElementById('cartDrawerBackdrop');
    if (drawer && backdrop) {
      drawer.classList.add('is-open');
      backdrop.classList.add('is-open');
      document.body.style.overflow = 'hidden';
      this.renderDrawer(this.calculateSummary());
    }
  }

  static closeDrawer() {
    const drawer = document.getElementById('cartDrawer');
    const backdrop = document.getElementById('cartDrawerBackdrop');
    if (drawer && backdrop) {
      drawer.classList.remove('is-open');
      backdrop.classList.remove('is-open');
      document.body.style.overflow = '';
    }
  }

  static renderDrawer(summary) {
    const container = document.getElementById('cartDrawerBody');
    const footer = document.getElementById('cartDrawerFooter');
    const offersBanner = document.getElementById('cartOffersBanner');
    const countHeader = document.getElementById('cartDrawerCount');

    if (countHeader) {
      countHeader.textContent = summary.itemCount === 1 ? '1 item' : `${summary.itemCount} items`;
    }

    if (!container) return;

    // Render Offer Progress Mismatch Tracker
    if (offersBanner) {
      let trackerHtml = '';
      if (summary.subtotal === 0) {
        trackerHtml = `
          <div class="cart-reward-bar">
            <span>Free shipping on orders above ₹499 · Complimentary pouch at ₹999</span>
          </div>
        `;
      } else if (!summary.freeShipping) {
        const diff = 499 - summary.subtotal;
        trackerHtml = `
          <div class="cart-reward-bar">
            <span class="reward-icon">🚚</span>
            <span>Add <strong>₹${diff.toLocaleString('en-IN')}</strong> more for <strong>Free Shipping across India</strong></span>
          </div>
        `;
      } else if (!summary.giftEligible) {
        const diff = 999 - summary.subtotal;
        trackerHtml = `
          <div class="cart-reward-bar is-unlocked">
            <span class="reward-icon">✓</span>
            <span>Free Shipping unlocked! Add <strong>₹${diff.toLocaleString('en-IN')}</strong> for a <strong>Complimentary Travel Pouch</strong> (₹500 value)</span>
          </div>
        `;
      } else if (!summary.discountEligible) {
        const diff = 1499 - summary.subtotal;
        trackerHtml = `
          <div class="cart-reward-bar is-unlocked">
            <span class="reward-icon">🎁</span>
            <span>Free Pouch unlocked! Add <strong>₹${diff.toLocaleString('en-IN')}</strong> for <strong>5% Salon Volume Discount</strong></span>
          </div>
        `;
      } else {
        trackerHtml = `
          <div class="cart-reward-bar is-all-unlocked">
            <span class="reward-icon">✨</span>
            <span><strong>All store perks unlocked!</strong> 5% Discount + Free Travel Pouch + Free Shipping!</span>
          </div>
        `;
      }
      offersBanner.innerHTML = trackerHtml;
    }

    // Render Empty State or Items List
    if (summary.items.length === 0) {
      container.innerHTML = `
        <div class="cart-empty-state">
          <div class="cart-empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path>
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <path d="M16 10a4 4 0 0 1-8 0"></path>
            </svg>
          </div>
          <h4 class="cart-empty-title">Your shopping bag is empty</h4>
          <p class="cart-empty-desc">Explore the 4 salon-exclusive formulations in our collection and add your desired quantities.</p>
          <a href="#products" class="btn btn-primary btn-sm auth-btn-lime cart-empty-btn" id="cartEmptyShopBtn">
            EXPLORE THE COLLECTION
          </a>
        </div>
      `;

      if (footer) footer.style.display = 'none';

      const shopBtn = document.getElementById('cartEmptyShopBtn');
      if (shopBtn) {
        shopBtn.addEventListener('click', () => {
          CartManager.closeDrawer();
        });
      }
      return;
    }

    if (footer) footer.style.display = 'block';

    // Items list
    container.innerHTML = `
      <div class="cart-items-list">
        ${summary.items.map(item => `
          <div class="cart-item-card" data-product-id="${item.id}">
            <img src="${item.imageUrl}" alt="${item.name}" class="cart-item-img">
            <div class="cart-item-details">
              <div class="cart-item-cat">${item.category} · ${item.size}</div>
              <h4 class="cart-item-title">${item.name}</h4>
              <div class="cart-item-price-line">
                <span class="cart-item-price">₹${item.price.toLocaleString('en-IN')}</span>
                <span class="cart-item-mrp">₹${item.mrp.toLocaleString('en-IN')}</span>
              </div>
              <div class="cart-item-controls">
                <div class="cart-qty-spinner">
                  <button type="button" class="cart-qty-btn cart-qty-minus" data-id="${item.id}" aria-label="Decrease quantity">&minus;</button>
                  <input type="number" min="1" max="99" value="${item.quantity}" class="cart-qty-input" data-id="${item.id}" aria-label="Quantity for ${item.name}">
                  <button type="button" class="cart-qty-btn cart-qty-plus" data-id="${item.id}" aria-label="Increase quantity">&plus;</button>
                </div>
                <button type="button" class="cart-item-remove-btn" data-id="${item.id}" aria-label="Remove item">
                  Remove
                </button>
              </div>
            </div>
          </div>
        `).join('')}

        ${summary.giftEligible ? `
          <div class="cart-item-card cart-item-gift">
            <div class="cart-gift-badge-thumb">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="20 12 20 22 4 22 4 12"></polyline>
                <rect x="2" y="7" width="20" height="5"></rect>
                <line x1="12" y1="22" x2="12" y2="7"></line>
                <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"></path>
                <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"></path>
              </svg>
            </div>
            <div class="cart-item-details">
              <div class="cart-item-cat" style="color:#0047AB; font-weight:700;">FREE COMPLIMENTARY REWARD</div>
              <h4 class="cart-item-title">Modish7 Signature Salon Travel Pouch</h4>
              <div class="cart-item-price-line">
                <span class="cart-item-price" style="color:#16a34a;">FREE</span>
                <span class="cart-item-mrp">₹500</span>
              </div>
              <span style="font-size:0.75rem; color:#666;">Included with your order above ₹999</span>
            </div>
          </div>
        ` : ''}
      </div>
    `;

    // Render Footer Totals
    if (footer) {
      footer.innerHTML = `
        <div class="cart-summary-breakdown">
          <div class="summary-line">
            <span>Subtotal</span>
            <span>₹${summary.subtotal.toLocaleString('en-IN')}</span>
          </div>

          ${summary.discountEligible ? `
            <div class="summary-line summary-discount">
              <span>5% Salon Volume Savings</span>
              <span>-₹${summary.discountAmount.toLocaleString('en-IN')}</span>
            </div>
          ` : ''}

          <div class="summary-line">
            <span>Shipping</span>
            <span>${summary.shippingFee === 0 ? '<strong style="color:#16a34a;">FREE</strong>' : `₹${summary.shippingFee}`}</span>
          </div>

          <div class="summary-line summary-total-line">
            <div>
              <div class="summary-total-label">Estimated Total</div>
              <div class="summary-gst-note">Inclusive of all applicable GST taxes</div>
            </div>
            <div class="summary-total-val">₹${summary.totalAmount.toLocaleString('en-IN')}</div>
          </div>
        </div>

        <div class="cart-footer-actions">
          <a href="/checkout" class="btn btn-primary btn-block auth-btn-lime cart-checkout-btn" id="cartProceedCheckoutBtn">
            PROCEED TO CHECKOUT &rarr;
          </a>
          <button type="button" class="cart-continue-btn" id="cartContinueShoppingBtn">
            Continue Shopping
          </button>
        </div>
      `;

      const continueBtn = document.getElementById('cartContinueShoppingBtn');
      if (continueBtn) {
        continueBtn.addEventListener('click', () => CartManager.closeDrawer());
      }
    }

    // Attach listeners to items controls
    container.querySelectorAll('.cart-qty-minus').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const current = summary.items.find(i => i.id === id);
        if (current) {
          CartManager.updateQuantity(id, current.quantity - 1);
        }
      });
    });

    container.querySelectorAll('.cart-qty-plus').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const current = summary.items.find(i => i.id === id);
        if (current) {
          CartManager.updateQuantity(id, current.quantity + 1);
        }
      });
    });

    container.querySelectorAll('.cart-qty-input').forEach(input => {
      input.addEventListener('change', () => {
        const id = input.dataset.id;
        const val = parseInt(input.value, 10);
        CartManager.updateQuantity(id, val);
      });
    });

    container.querySelectorAll('.cart-item-remove-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        CartManager.removeItem(btn.dataset.id);
      });
    });
  }

  static init() {
    // Listen for storage events across tabs
    window.addEventListener('storage', (e) => {
      if (e.key === CART_KEY) {
        this.notifyUpdate();
      }
    });

    // Wire up backdrop and drawer close button
    const closeBtn = document.getElementById('cartDrawerClose');
    const backdrop = document.getElementById('cartDrawerBackdrop');
    if (closeBtn) closeBtn.addEventListener('click', () => this.closeDrawer());
    if (backdrop) backdrop.addEventListener('click', () => this.closeDrawer());

    // Wire up header cart button
    const headerCartBtn = document.getElementById('headerCartBtn');
    if (headerCartBtn) {
      headerCartBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.openDrawer();
      });
    }

    // Initial badge & drawer sync
    this.notifyUpdate();
  }
}
