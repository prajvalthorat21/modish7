/**
 * MODISH7 — SALON PARTNER AUTHENTICATION HELPER
 * Secure JWT storage, session validation, and authorized API requests
 */

const TOKEN_KEY = 'modish7_partner_token';
const SALON_KEY = 'modish7_partner_data';

export const Auth = {
  // Check if token exists in localStorage or was passed in URL query param
  init() {
    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get('token');
    if (urlToken) {
      localStorage.setItem(TOKEN_KEY, urlToken);
      urlParams.delete('token');
      urlParams.delete('google');
      const cleanUrl = window.location.pathname + (urlParams.toString() ? `?${urlParams.toString()}` : '') + window.location.hash;
      window.history.replaceState({}, document.title, cleanUrl);
    }
  },

  getToken() {
    this.init();
    return localStorage.getItem(TOKEN_KEY);
  },

  setSession(token, salon) {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    if (salon) localStorage.setItem(SALON_KEY, JSON.stringify(salon));
  },

  clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(SALON_KEY);
  },

  getStoredSalon() {
    try {
      const data = localStorage.getItem(SALON_KEY);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  },

  isAuthenticated() {
    return Boolean(this.getToken());
  },

  async authFetch(url, options = {}) {
    const token = this.getToken();
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(url, { ...options, headers });
    if (res.status === 401) {
      // Session expired or invalid
      this.clearSession();
      if (window.location.pathname.startsWith('/account')) {
        window.location.href = '/login?expired=1';
      }
    }
    return res;
  },

  async fetchMe() {
    if (!this.getToken()) return null;
    try {
      const res = await this.authFetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.salon) {
          localStorage.setItem(SALON_KEY, JSON.stringify(data.salon));
          return data.salon;
        }
      }
    } catch (err) {
      console.error('[Auth.fetchMe Error]:', err);
    }
    return null;
  },

  async login(email, password, rememberMe = false) {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, rememberMe })
    });
    const data = await res.json();
    if (data.success && data.token) {
      this.setSession(data.token, data.salon);
    }
    return data;
  },

  async register(registrationData) {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(registrationData)
    });
    const data = await res.json();
    if (data.success && data.token) {
      this.setSession(data.token, data.salon);
    }
    return data;
  },

  async googleLoginWithToken(credential) {
    const res = await fetch('/api/auth/google/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential })
    });
    const data = await res.json();
    if (data.success && data.token) {
      this.setSession(data.token, data.salon);
    }
    return data;
  },

  async changePassword(currentPassword, newPassword) {
    const res = await this.authFetch('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword })
    });
    return res.json();
  },

  async logout() {
    try {
      await this.authFetch('/api/auth/logout', { method: 'POST' });
    } finally {
      this.clearSession();
      window.location.href = '/login?logged_out=1';
    }
  },

  async recoverPassword(email) {
    const res = await fetch('/api/auth/recover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    return res.json();
  },

  async resetPassword(token, newPassword) {
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, newPassword })
    });
    return res.json();
  }
};
