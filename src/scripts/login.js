import { Auth } from './auth.js';

document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  const redirectUrl = params.get('redirect') || '/account';

  // If already authenticated, redirect to destination immediately
  if (Auth.isAuthenticated()) {
    const salon = await Auth.fetchMe();
    if (salon) {
      window.location.href = redirectUrl;
      return;
    }
  }

  const loginForm = document.getElementById('loginForm');
  const alertBox = document.getElementById('loginAlert');
  const forgotBtn = document.getElementById('forgotPasswordBtn');
  const recoverModal = document.getElementById('recoverModal');
  const closeRecoverModal = document.getElementById('closeRecoverModal');
  const recoverForm = document.getElementById('recoverForm');
  const recoverAlert = document.getElementById('recoverAlert');
  const togglePasswordBtn = document.getElementById('togglePasswordBtn');
  const loginPassword = document.getElementById('loginPassword');

  // Password visibility toggle
  if (togglePasswordBtn && loginPassword) {
    togglePasswordBtn.addEventListener('click', () => {
      const isPassword = loginPassword.type === 'password';
      loginPassword.type = isPassword ? 'text' : 'password';
      togglePasswordBtn.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
      
      const eyeOpen = togglePasswordBtn.querySelector('.eye-open');
      const eyeClosed = togglePasswordBtn.querySelector('.eye-closed');
      if (eyeOpen && eyeClosed) {
        eyeOpen.style.display = isPassword ? 'none' : 'block';
        eyeClosed.style.display = isPassword ? 'block' : 'none';
      }
    });
  }

  // Check URL params for feedback (e.g. registered=1, expired=1, logged_out=1, google errors)
  if (params.get('registered') === '1') {
    showAlert('Account created successfully. Please sign in.', 'success');
  } else if (params.get('logged_out') === '1') {
    showAlert('You have been signed out securely.', 'success');
  } else if (params.get('expired') === '1') {
    showAlert('Your session has expired. Please sign in again.', 'error');
  } else if (params.get('error') === 'google_not_configured') {
    showAlert('Google OAuth is not configured on this server. Please sign in with email/password, or set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.', 'error');
  } else if (params.get('error') === 'google_cancelled') {
    showAlert('Google sign-in was cancelled. Please try again or sign in with your email.', 'error');
  } else if (params.get('error')) {
    showAlert(`Sign-in error: ${decodeURIComponent(params.get('error'))}`, 'error');
  }

  function showAlert(msg, type = 'error') {
    if (!alertBox) return;
    alertBox.textContent = msg;
    alertBox.className = `auth-alert auth-alert-${type}`;
    alertBox.style.display = 'block';
  }

  function hideAlert() {
    if (alertBox) alertBox.style.display = 'none';
  }

  // Handle Login submission
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideAlert();

      const email = document.getElementById('loginEmail').value.trim();
      const password = loginPassword ? loginPassword.value : '';
      const rememberMe = document.getElementById('loginRemember')?.checked || false;
      const submitBtn = document.getElementById('loginSubmitBtn');

      if (!email || !password) {
        showAlert('Please enter both your email address and password.', 'error');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'SIGNING IN...';

      try {
        const result = await Auth.login(email, password, rememberMe);
        if (result.success) {
          window.location.href = redirectUrl;
        } else {
          showAlert(result.error || 'Authentication failed. Please verify credentials.', 'error');
        }
      } catch (err) {
        showAlert('Network or server connection error. Please try again.', 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'SIGN IN';
      }
    });
  }

  // Handle Password Recovery Modal
  if (forgotBtn && recoverModal) {
    forgotBtn.addEventListener('click', (e) => {
      e.preventDefault();
      recoverModal.classList.add('is-open');
    });
  }

  if (closeRecoverModal && recoverModal) {
    closeRecoverModal.addEventListener('click', () => {
      recoverModal.classList.remove('is-open');
    });
  }

  if (recoverForm) {
    recoverForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('recoverEmail').value.trim();
      const recoverBtn = document.getElementById('recoverSubmitBtn');

      recoverBtn.disabled = true;
      recoverBtn.textContent = 'DISPATCHING...';

      try {
        const res = await Auth.recoverPassword(email);
        if (recoverAlert) {
          recoverAlert.textContent = res.message || 'Password recovery instructions dispatched.';
          recoverAlert.className = 'auth-alert auth-alert-success';
          recoverAlert.style.display = 'block';

          if (res.resetToken) {
            recoverAlert.innerHTML += `<br><small style="margin-top:6px;display:block;">[Sandbox Verification Code]: <strong>${res.resetToken}</strong></small>`;
          }
        }
      } catch (err) {
        if (recoverAlert) {
          recoverAlert.textContent = 'Error processing recovery request.';
          recoverAlert.className = 'auth-alert auth-alert-error';
          recoverAlert.style.display = 'block';
        }
      } finally {
        recoverBtn.disabled = false;
        recoverBtn.textContent = 'SEND RECOVERY INSTRUCTIONS';
      }
    });
  }
});
