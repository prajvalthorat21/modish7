import { Auth } from './auth.js';

document.addEventListener('DOMContentLoaded', () => {
  initHeader();
  initHeroVideo();
  initMobileNav();
  initSmoothScroll();
  initProductEnquirySync();
  initEnquiryForm();
  initSpecModal();
});

/* --------------------------------------------------------------------------
   1. Site Header Transitions & Partner Account Status
   -------------------------------------------------------------------------- */
function initHeader() {
  const header = document.querySelector('.site-header');
  if (!header) return;

  function updateHeader() {
    if (window.scrollY > 20) {
      header.classList.add('is-scrolled');
    } else {
      header.classList.remove('is-scrolled');
    }
  }

  window.addEventListener('scroll', updateHeader, { passive: true });
  updateHeader();

  // Dynamic Customer Account Link & Dropdown Navigation
  const accountContainer = document.getElementById('headerAccountContainer');
  const desktopAuthLink = document.getElementById('headerAuthLink');
  const headerAccountText = document.getElementById('headerAccountText');
  const headerAccountChevron = document.getElementById('headerAccountChevron');
  const headerAccountDropdown = document.getElementById('headerAccountDropdown');
  const dropdownUserName = document.getElementById('dropdownUserName');
  const dropdownUserEmail = document.getElementById('dropdownUserEmail');
  const headerLogoutBtn = document.getElementById('headerLogoutBtn');

  const mobileAuthLink = document.getElementById('mobileAuthLink');
  const mobileLogoutItem = document.getElementById('mobileLogoutItem');
  const mobileLogoutBtn = document.getElementById('mobileLogoutBtn');

  if (Auth.isAuthenticated()) {
    let salon = Auth.getStoredSalon();

    function applyLoggedInState(user) {
      if (!user) return;
      if (headerAccountText) headerAccountText.textContent = 'MY ACCOUNT';
      if (desktopAuthLink) {
        desktopAuthLink.classList.add('is-logged-in');
        desktopAuthLink.href = '#account-menu';
        desktopAuthLink.setAttribute('aria-haspopup', 'true');
        desktopAuthLink.setAttribute('aria-expanded', 'false');
      }
      if (headerAccountChevron) headerAccountChevron.style.display = 'inline-block';

      if (dropdownUserName) dropdownUserName.textContent = user.full_name || user.business_name || 'Customer Account';
      if (dropdownUserEmail) dropdownUserEmail.textContent = user.email || '';

      if (mobileAuthLink) {
        mobileAuthLink.textContent = 'My Account';
        mobileAuthLink.href = '/account';
      }
      if (mobileLogoutItem) mobileLogoutItem.style.display = 'block';
    }

    if (salon) {
      applyLoggedInState(salon);
    }

    // Refresh user state in background
    Auth.fetchMe().then(freshUser => {
      if (freshUser) applyLoggedInState(freshUser);
    }).catch(() => {});

    // Toggle Dropdown Menu
    if (desktopAuthLink && headerAccountDropdown) {
      desktopAuthLink.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const isOpen = headerAccountDropdown.style.display === 'block';
        headerAccountDropdown.style.display = isOpen ? 'none' : 'block';
        if (accountContainer) accountContainer.classList.toggle('is-open', !isOpen);
        desktopAuthLink.setAttribute('aria-expanded', !isOpen ? 'true' : 'false');
      });

      // Close on outside click
      document.addEventListener('click', (e) => {
        if (accountContainer && !accountContainer.contains(e.target)) {
          headerAccountDropdown.style.display = 'none';
          accountContainer.classList.remove('is-open');
          desktopAuthLink.setAttribute('aria-expanded', 'false');
        }
      });
    }

    // Desktop Sign Out
    if (headerLogoutBtn) {
      headerLogoutBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        if (confirm('Are you sure you want to sign out?')) {
          await Auth.logout();
        }
      });
    }

    // Mobile Sign Out
    if (mobileLogoutBtn) {
      mobileLogoutBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        if (confirm('Are you sure you want to sign out?')) {
          await Auth.logout();
        }
      });
    }

  } else {
    // Logged Out State
    if (headerAccountText) headerAccountText.textContent = 'LOGIN';
    if (desktopAuthLink) {
      desktopAuthLink.classList.remove('is-logged-in');
      desktopAuthLink.href = '/login';
    }
    if (headerAccountChevron) headerAccountChevron.style.display = 'none';
    if (headerAccountDropdown) headerAccountDropdown.style.display = 'none';

    if (mobileAuthLink) {
      mobileAuthLink.textContent = 'Login';
      mobileAuthLink.href = '/login';
    }
    if (mobileLogoutItem) mobileLogoutItem.style.display = 'none';
  }
}

/* --------------------------------------------------------------------------
   2. Hero Video Optimization, Cross-Browser Playback & Reduced Motion
   -------------------------------------------------------------------------- */
function initHeroVideo() {
  const video = document.getElementById('heroVideo');
  const heroSection = document.getElementById('hero');
  if (!video || !heroSection) return;

  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const mobileQuery = window.matchMedia('(max-width: 768px)');

  // Responsive poster selection
  function updatePoster() {
    const isMobile = mobileQuery.matches;
    const targetPoster = isMobile 
      ? '/assets/modish7/hero-poster-mobile.webp' 
      : '/assets/modish7/hero-poster.webp';
    if (video.getAttribute('poster') !== targetPoster) {
      video.setAttribute('poster', targetPoster);
    }
  }
  updatePoster();

  // Crucial cross-browser mobile & desktop video attributes
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.setAttribute('muted', '');
  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', '');
  video.loop = true;

  let hasUserInteracted = false;
  let isPlayRequested = false;
  let retryListenersAttached = false;

  // Track playback status on container for graceful styling & fallback
  function setVideoState(state) {
    heroSection.dataset.videoState = state;
    if (state === 'playing') {
      heroSection.classList.add('video-is-playing');
      heroSection.classList.remove('video-is-fallback', 'video-is-waiting');
    } else if (state === 'fallback' || state === 'error') {
      heroSection.classList.add('video-is-fallback');
      heroSection.classList.remove('video-is-playing', 'video-is-waiting');
    } else if (state === 'waiting' || state === 'stalled') {
      heroSection.classList.add('video-is-waiting');
    }
  }

  // Attempt playback safely handling returned promise
  async function attemptPlay() {
    if (motionQuery.matches) {
      // Gracefully honour reduced motion without broken hero
      video.pause();
      setVideoState('fallback');
      return;
    }

    if (isPlayRequested) return;
    isPlayRequested = true;

    try {
      video.muted = true;
      const playPromise = video.play();
      if (playPromise !== undefined) {
        await playPromise;
        setVideoState('playing');
        detachRetryListeners();
      }
    } catch (err) {
      // Autoplay restricted by browser policy (e.g. low-power mode, battery saver)
      // Keep approved visual poster fallback and listen for safe interaction
      setVideoState('fallback');
      attachRetryListeners();
    } finally {
      isPlayRequested = false;
    }
  }

  // Graceful retry on user interaction without infinite loop
  function onUserInteraction() {
    if (hasUserInteracted) return;
    hasUserInteracted = true;
    detachRetryListeners();
    if (!motionQuery.matches && video.paused) {
      attemptPlay();
    }
  }

  function attachRetryListeners() {
    if (retryListenersAttached || hasUserInteracted) return;
    retryListenersAttached = true;
    const events = ['touchstart', 'pointerdown', 'click', 'scroll', 'keydown'];
    events.forEach(evt => {
      window.addEventListener(evt, onUserInteraction, { once: true, passive: true });
    });
  }

  function detachRetryListeners() {
    if (!retryListenersAttached) return;
    retryListenersAttached = false;
    const events = ['touchstart', 'pointerdown', 'click', 'scroll', 'keydown'];
    events.forEach(evt => {
      window.removeEventListener(evt, onUserInteraction);
    });
  }

  // Media event handlers for diagnostic accuracy and resilience
  video.addEventListener('loadedmetadata', () => {
    updatePoster();
  });

  video.addEventListener('canplay', () => {
    if (!motionQuery.matches && video.paused && !hasUserInteracted) {
      attemptPlay();
    }
  });

  video.addEventListener('playing', () => {
    setVideoState('playing');
  });

  video.addEventListener('waiting', () => {
    setVideoState('waiting');
  });

  video.addEventListener('stalled', () => {
    // Retain currently rendered frame or poster, avoid blanking
    if (video.paused && !motionQuery.matches) {
      setVideoState('waiting');
    }
  });

  video.addEventListener('error', () => {
    console.warn('[Modish7 Hero Video] Playback error occurred:', video.error);
    setVideoState('fallback');
  });

  // Handle visibility changes (preserve battery / avoid running while backgrounded)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      if (!video.paused) {
        video.pause();
      }
    } else if (document.visibilityState === 'visible') {
      if (!motionQuery.matches && video.paused && isHeroInView) {
        attemptPlay();
      }
    }
  });

  // IntersectionObserver for view-aware playback
  let isHeroInView = true;
  if ('IntersectionObserver' in window) {
    const videoObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        isHeroInView = entry.isIntersecting;
        if (isHeroInView) {
          if (!motionQuery.matches && video.paused) {
            attemptPlay();
          }
        } else {
          if (!video.paused) {
            video.pause();
          }
        }
      });
    }, { threshold: 0.15 });

    videoObserver.observe(heroSection);
  }

  // Handle live toggle of reduced motion preference
  motionQuery.addEventListener('change', (e) => {
    if (e.matches) {
      video.pause();
      setVideoState('fallback');
    } else {
      attemptPlay();
    }
  });

  // Handle viewport resize across mobile/desktop breakpoint cleanly
  mobileQuery.addEventListener('change', (e) => {
    updatePoster();
    const wasPlaying = !video.paused;
    video.load();
    if (wasPlaying && !motionQuery.matches) {
      attemptPlay();
    }
  });

  // Initial trigger
  if (motionQuery.matches) {
    video.pause();
    setVideoState('fallback');
  } else {
    attemptPlay();
  }
}

/* --------------------------------------------------------------------------
   3. Mobile Navigation Drawer
   -------------------------------------------------------------------------- */
function initMobileNav() {
  const openBtn = document.getElementById('mobileMenuBtn');
  const closeBtn = document.getElementById('mobileDrawerClose');
  const drawer = document.getElementById('mobileNavDrawer');
  const backdrop = document.getElementById('mobileDrawerBackdrop');
  const links = document.querySelectorAll('.mobile-nav-link, .mobile-drawer-cta');

  if (!openBtn || !drawer || !backdrop) return;

  function openDrawer() {
    drawer.classList.add('is-open');
    backdrop.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }

  function closeDrawer() {
    drawer.classList.remove('is-open');
    backdrop.classList.remove('is-open');
    document.body.style.overflow = '';
  }

  openBtn.addEventListener('click', openDrawer);
  if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
  backdrop.addEventListener('click', closeDrawer);

  links.forEach(link => {
    link.addEventListener('click', closeDrawer);
  });
}

/* --------------------------------------------------------------------------
   4. Smooth Anchor Scrolling with Header Compensation
   -------------------------------------------------------------------------- */
function initSmoothScroll() {
  const anchorLinks = document.querySelectorAll('a[href^="#"]');

  anchorLinks.forEach(link => {
    link.addEventListener('click', function(e) {
      const href = this.getAttribute('href');
      if (href === '#' || !href) return;

      const target = document.querySelector(href);
      if (!target) return;

      e.preventDefault();
      const headerHeight = document.querySelector('.site-header')?.offsetHeight || 80;
      const targetPos = target.getBoundingClientRect().top + window.pageYOffset - headerHeight + 10;

      window.scrollTo({
        top: targetPos,
        behavior: 'smooth'
      });
    });
  });
}

/* --------------------------------------------------------------------------
   5. Interactive Product Sync with Enquiry Form
   -------------------------------------------------------------------------- */
function initProductEnquirySync() {
  const productCards = document.querySelectorAll('.product-card');
  const formOptions = document.querySelectorAll('.form-product-option');

  // Sync click on "ENQUIRE FOR SALON ORDERS" buttons on product cards
  productCards.forEach(card => {
    const enquireBtn = card.querySelector('.btn-enquire-product');
    const productId = card.getAttribute('data-product-id');

    if (enquireBtn && productId) {
      enquireBtn.addEventListener('click', (e) => {
        e.preventDefault();
        selectFormProduct(productId);
        scrollToEnquirySection();
      });
    }
  });

  // Handle direct clicks on form product cards
  formOptions.forEach(option => {
    const checkbox = option.querySelector('.form-product-checkbox');
    
    option.addEventListener('click', (e) => {
      // Prevent double toggle if clicked directly on input checkbox
      if (e.target !== checkbox) {
        checkbox.checked = !checkbox.checked;
      }
      updateOptionState(option, checkbox.checked);
    });

    checkbox.addEventListener('change', () => {
      updateOptionState(option, checkbox.checked);
    });
  });

  function updateOptionState(optionEl, isChecked) {
    if (isChecked) {
      optionEl.classList.add('is-selected');
    } else {
      optionEl.classList.remove('is-selected');
    }
  }

  function selectFormProduct(productId) {
    const targetOption = document.querySelector(`.form-product-option[data-product-id="${productId}"]`);
    if (targetOption) {
      const checkbox = targetOption.querySelector('.form-product-checkbox');
      if (checkbox) {
        checkbox.checked = true;
        updateOptionState(targetOption, true);
        const prodError = document.getElementById('productSelectError');
        if (prodError) {
          prodError.classList.remove('is-visible');
          prodError.textContent = '';
        }
      }
    }
  }

  function scrollToEnquirySection() {
    const enquirySec = document.getElementById('enquiry');
    if (!enquirySec) return;

    const headerHeight = document.querySelector('.site-header')?.offsetHeight || 80;
    const targetPos = enquirySec.getBoundingClientRect().top + window.pageYOffset - headerHeight + 10;

    window.scrollTo({
      top: targetPos,
      behavior: 'smooth'
    });

    // Gentle flash animation on form card to guide eye
    const formCard = document.querySelector('.enquiry-form-card');
    if (formCard) {
      formCard.style.outline = '2px solid var(--modish-cobalt)';
      formCard.style.transition = 'outline 0.3s ease';
      setTimeout(() => {
        formCard.style.outline = 'none';
      }, 1500);
    }
  }
}

/* --------------------------------------------------------------------------
   6. Salon Enquiry Form Validation & Multi-channel Dispatch
   -------------------------------------------------------------------------- */
function initEnquiryForm() {
  const form = document.getElementById('salonEnquiryForm');
  if (!form) return;

  const successAlert = document.getElementById('formSuccessAlert');
  const errorAlert = document.getElementById('formErrorAlert');
  const summaryBox = document.getElementById('enquirySummaryBox');
  const copyBtn = document.getElementById('copyEnquiryBtn');
  const whatsappChannelBtn = document.getElementById('whatsappChannelBtn');
  const emailChannelBtn = document.getElementById('emailChannelBtn');

  // Input fields
  const salonNameInput = document.getElementById('salonName');
  const contactPersonInput = document.getElementById('contactPerson');
  const phoneInput = document.getElementById('phone');
  const emailInput = document.getElementById('email');
  const cityInput = document.getElementById('city');
  const businessTypeSelect = document.getElementById('businessType');
  const orderQuantitySelect = document.getElementById('orderQuantity');
  const notesInput = document.getElementById('additionalNotes');
  const ackCheckbox = document.getElementById('businessAck');

  let currentEnquirySummary = '';

  form.addEventListener('submit', function(e) {
    e.preventDefault();
    clearErrors();

    let isValid = true;

    // Validate Salon Name
    if (!salonNameInput.value.trim()) {
      showError(salonNameInput, 'Please enter your salon or business name.');
      isValid = false;
    }

    // Validate Contact Person
    if (!contactPersonInput.value.trim()) {
      showError(contactPersonInput, "Please enter the contact person's name.");
      isValid = false;
    }

    // Validate Phone Number (Indian mobile 10 digits or international)
    const phoneDigits = phoneInput.value.replace(/\D/g, '');
    if (!phoneInput.value.trim()) {
      showError(phoneInput, 'Please enter a business contact phone number.');
      isValid = false;
    } else if (phoneDigits.length < 10) {
      showError(phoneInput, 'Please enter a valid phone number (at least 10 digits).');
      isValid = false;
    }

    // Validate Email
    const emailVal = emailInput.value.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailVal) {
      showError(emailInput, 'Please enter your business email address.');
      isValid = false;
    } else if (!emailRegex.test(emailVal)) {
      showError(emailInput, 'Please enter a valid email address.');
      isValid = false;
    }

    // Validate City
    if (!cityInput.value.trim()) {
      showError(cityInput, 'Please enter your city.');
      isValid = false;
    }

    // Validate Products of Interest (at least one)
    const selectedProductCheckboxes = document.querySelectorAll('.form-product-checkbox:checked');
    if (selectedProductCheckboxes.length === 0) {
      const prodError = document.getElementById('productSelectError');
      if (prodError) {
        prodError.classList.add('is-visible');
        prodError.textContent = 'Please select at least one product of interest for your salon.';
      }
      isValid = false;
    }

    // Validate Acknowledgement
    if (!ackCheckbox.checked) {
      showError(ackCheckbox, 'Please confirm this enquiry is for a salon or professional business.');
      isValid = false;
    }

    if (!isValid) {
      if (errorAlert) {
        errorAlert.classList.add('is-error');
        errorAlert.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    // Compile Selected Products List
    const selectedProducts = [];
    selectedProductCheckboxes.forEach(cb => {
      const card = cb.closest('.form-product-option');
      const title = card.getAttribute('data-product-title') || cb.value;
      const refPrice = card.getAttribute('data-ref-price') || '';
      selectedProducts.push(`${title} (${refPrice})`);
    });

    const refId = 'MOD-SALON-' + Date.now().toString(36).toUpperCase();

    // Create Structured Payload
    const enquiryPayload = {
      referenceId: refId,
      date: new Date().toISOString(),
      salonName: salonNameInput.value.trim(),
      contactPerson: contactPersonInput.value.trim(),
      phone: phoneInput.value.trim(),
      email: emailInput.value.trim(),
      city: cityInput.value.trim(),
      businessType: businessTypeSelect.value,
      orderQuantity: orderQuantitySelect.value,
      products: selectedProducts,
      notes: notesInput.value.trim() || 'None specified'
    };

    // Store in localStorage
    try {
      const existing = JSON.parse(localStorage.getItem('modish7_salon_enquiries') || '[]');
      existing.push(enquiryPayload);
      localStorage.setItem('modish7_salon_enquiries', JSON.stringify(existing));
    } catch (e) {
      console.warn('Storage error:', e);
    }

    // Format human-readable summary
    currentEnquirySummary = `--- MODISH7 SALON PARTNERSHIP ENQUIRY ---
Reference: ${refId}
Salon / Business: ${enquiryPayload.salonName}
Contact Person: ${enquiryPayload.contactPerson}
Phone: ${enquiryPayload.phone}
Email: ${enquiryPayload.email}
City: ${enquiryPayload.city}
Business Type: ${enquiryPayload.businessType}
Estimated Batch Size: ${enquiryPayload.orderQuantity}
Products of Interest:
${enquiryPayload.products.map(p => `  • ${p}`).join('\n')}
Additional Notes: ${enquiryPayload.notes}
------------------------------------------`;

    // Show Success State
    if (errorAlert) errorAlert.classList.remove('is-error');
    if (successAlert) {
      successAlert.classList.add('is-success');
      const refSpan = document.getElementById('enquiryRefNumber');
      if (refSpan) refSpan.textContent = refId;
      if (summaryBox) summaryBox.textContent = currentEnquirySummary;
      successAlert.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // Update alternative dispatch buttons
    const whatsappMsg = encodeURIComponent(
      `Hello Modish7 Team, I am submitting a Salon Partnership Enquiry.\n\n` +
      `Salon: ${enquiryPayload.salonName}\n` +
      `Contact: ${enquiryPayload.contactPerson}\n` +
      `City: ${enquiryPayload.city}\n` +
      `Phone: ${enquiryPayload.phone}\n` +
      `Products: ${enquiryPayload.products.join(', ')}\n` +
      `Quantity: ${enquiryPayload.orderQuantity}\n` +
      `Reference ID: ${refId}`
    );

    if (whatsappChannelBtn) {
      whatsappChannelBtn.href = `https://wa.me/?text=${whatsappMsg}`;
    }

    if (emailChannelBtn) {
      const mailSubject = encodeURIComponent(`Salon Partnership Enquiry: ${enquiryPayload.salonName} (${refId})`);
      const mailBody = encodeURIComponent(currentEnquirySummary);
      emailChannelBtn.href = `mailto:support@modish7.com?subject=${mailSubject}&body=${mailBody}`;
    }

    // Reset Form fields
    form.reset();
    document.querySelectorAll('.form-product-option').forEach(opt => opt.classList.remove('is-selected'));
  });

  // Copy Enquiry Text
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      if (currentEnquirySummary) {
        navigator.clipboard.writeText(currentEnquirySummary).then(() => {
          const originalText = copyBtn.textContent;
          copyBtn.textContent = 'Enquiry Details Copied!';
          setTimeout(() => {
            copyBtn.textContent = originalText;
          }, 2500);
        });
      }
    });
  }

  function showError(inputEl, msg) {
    inputEl.classList.add('is-invalid');
    const parentGroup = inputEl.closest('.form-group') || inputEl.parentElement;
    const errorMsgEl = parentGroup.querySelector('.field-error-msg');
    if (errorMsgEl) {
      errorMsgEl.textContent = msg;
      errorMsgEl.classList.add('is-visible');
    }
  }

  function clearErrors() {
    form.querySelectorAll('.is-invalid').forEach(el => el.classList.remove('is-invalid'));
    form.querySelectorAll('.field-error-msg').forEach(el => {
      el.classList.remove('is-visible');
      el.textContent = '';
    });
    if (errorAlert) errorAlert.classList.remove('is-error');
  }
}

/* --------------------------------------------------------------------------
   7. Specification & Application Modal
   -------------------------------------------------------------------------- */
const PRODUCT_SPECS = {
  'shea-butter-combo': {
    title: 'Modish7 Shea Butter Shampoo & Conditioner Combo',
    size: '350ml Shampoo + 350ml Conditioner',
    tag: 'Signature 2-Bottle Salon Pairing',
    hairTypes: 'Dry, chemically straightened, keratin-treated, bleached or color-processed hair.',
    keyIngredients: 'Cold-pressed Shea Butter, Moroccan Argan Oil, Hydrolyzed Keratin Protein, Vitamin E.',
    backbarUsage: 'Apply Shampoo to thoroughly wet hair, emulsify from roots to ends for 90 seconds. Rinse cleanly. Follow with Shea Butter Conditioner from mid-lengths to ends, comb through with wide-tooth comb for 3-5 minutes before final cool-water rinse.',
    phBalance: 'Shampoo pH 5.5 (Acid-balanced) | Conditioner pH 4.5 (Cuticle-sealing)'
  },
  'mks-eco-detangler': {
    title: 'MKS eco X Leave-In & Detangler (Original Scent)',
    size: '118ml Spray Mist',
    tag: 'Leave-In Care & Salon Styling Prep',
    hairTypes: 'Tangled, textured, frizzy, fine or knot-prone hair requiring weightless detangling.',
    keyIngredients: 'Argan Oil, Hemp Seed Oil, Panthenol (Pro-Vitamin B5), Botanical Amino Extracts.',
    backbarUsage: 'Mist evenly onto damp, towel-dried hair after backbar rinsing. Section hair and comb through effortlessly prior to blow-drying or heat styling. Protects against thermal friction.',
    phBalance: 'pH 5.0'
  },
  'shea-butter-conditioner': {
    title: 'Modish7 Shea Butter Conditioner',
    size: '350ml Bottle',
    tag: 'Deep Conditioning & Cuticle Sealing',
    hairTypes: 'Coarse, parched, high-porosity Indian hair suffering from dry weather and water hardness.',
    keyIngredients: 'Refined African Shea Butter, Panthenol, Keratin Amino Acids, Botanical Emollients.',
    backbarUsage: 'Use as a standalone conditioning ritual. Emulsify palms and work through damaged lengths. Leave under steam or hot towel for 5 minutes for intensified moisture infusion.',
    phBalance: 'pH 4.5 (Cuticle closing)'
  },
  'anti-dandruff-shampoo': {
    title: 'Modish7 Anti-Dandruff Shampoo',
    size: '350ml Bottle',
    tag: 'Botanical Scalp Purification & Balancing',
    hairTypes: 'Flaky scalp, itchy or sebum-imbalanced scalp conditions requiring clarifying relief without drying ends.',
    keyIngredients: 'Zinc Pyrithione Complex, Tea Tree Extract, Salicylic Acid Derivative, Aloe Vera Soothing Base.',
    backbarUsage: 'Section hair at the wash basin. Apply directly to scalp, massage gently with finger pads for 2 minutes to loosen flaking. Allow actives to sit for 1 minute before rinsing with lukewarm water.',
    phBalance: 'pH 5.8'
  }
};

function initSpecModal() {
  const modalBackdrop = document.getElementById('specModal');
  const closeBtn = document.getElementById('specModalClose');
  const specTriggers = document.querySelectorAll('.btn-view-spec');

  if (!modalBackdrop) return;

  specTriggers.forEach(btn => {
    btn.addEventListener('click', () => {
      const specId = btn.getAttribute('data-spec-id');
      const data = PRODUCT_SPECS[specId];
      if (!data) return;

      document.getElementById('modalProductTitle').textContent = data.title;
      document.getElementById('modalProductTag').textContent = `${data.tag} · ${data.size}`;
      document.getElementById('modalHairTypes').textContent = data.hairTypes;
      document.getElementById('modalIngredients').textContent = data.keyIngredients;
      document.getElementById('modalBackbarUsage').textContent = data.backbarUsage;
      document.getElementById('modalPhBalance').textContent = data.phBalance;

      modalBackdrop.classList.add('is-open');
      document.body.style.overflow = 'hidden';
    });
  });

  function closeModal() {
    modalBackdrop.classList.remove('is-open');
    document.body.style.overflow = '';
  }

  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  modalBackdrop.addEventListener('click', (e) => {
    if (e.target === modalBackdrop) closeModal();
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalBackdrop.classList.contains('is-open')) {
      closeModal();
    }
  });
}
