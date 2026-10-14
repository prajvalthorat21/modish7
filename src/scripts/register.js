import { Auth } from './auth.js';

document.addEventListener('DOMContentLoaded', async () => {
  if (Auth.isAuthenticated()) {
    const salon = await Auth.fetchMe();
    if (salon) {
      window.location.href = '/account';
      return;
    }
  }

  const registerForm = document.getElementById('registerForm');
  const alertBox = document.getElementById('registerAlert');
  const regPassword = document.getElementById('regPassword');
  const regConfirmPassword = document.getElementById('regConfirmPassword');
  const toggleRegPasswordBtn = document.getElementById('toggleRegPasswordBtn');
  const toggleRegConfirmPasswordBtn = document.getElementById('toggleRegConfirmPasswordBtn');

  // Password visibility toggle helpers
  function setupPasswordToggle(button, input) {
    if (!button || !input) return;
    button.addEventListener('click', () => {
      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';
      button.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');

      const eyeOpen = button.querySelector('.eye-open');
      const eyeClosed = button.querySelector('.eye-closed');
      if (eyeOpen && eyeClosed) {
        eyeOpen.style.display = isPassword ? 'none' : 'block';
        eyeClosed.style.display = isPassword ? 'block' : 'none';
      }
    });
  }

  setupPasswordToggle(toggleRegPasswordBtn, regPassword);
  setupPasswordToggle(toggleRegConfirmPasswordBtn, regConfirmPassword);

  function showAlert(msg, type = 'error') {
    if (!alertBox) return;
    alertBox.textContent = msg;
    alertBox.className = `auth-alert auth-alert-${type}`;
    alertBox.style.display = 'block';
  }

  function hideAlert() {
    if (alertBox) alertBox.style.display = 'none';
  }

  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideAlert();

      const fullName = document.getElementById('regFullName').value.trim();
      const email = document.getElementById('regEmail').value.trim();
      const businessName = document.getElementById('regBusinessName').value.trim();
      const password = regPassword ? regPassword.value : '';
      const confirmPassword = regConfirmPassword ? regConfirmPassword.value : '';
      const termsAgreed = document.getElementById('regTerms').checked;
      const submitBtn = document.getElementById('registerSubmitBtn');

      // Client-side validations
      if (!fullName) return showAlert('Please enter your full name.');
      if (!email) return showAlert('Valid email address is required.');
      
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) return showAlert('Please enter a valid email address.');

      if (password.length < 8) return showAlert('Password must contain at least 8 characters.');
      if (password !== confirmPassword) return showAlert('Passwords do not match. Please verify.');
      if (!termsAgreed) return showAlert('You must accept the terms of supply and privacy notice.');

      submitBtn.disabled = true;
      submitBtn.textContent = 'CREATING ACCOUNT...';

      try {
        const result = await Auth.register({
          fullName,
          businessName,
          email,
          password,
          confirmPassword,
          termsAgreed
        });

        if (result.success) {
          window.location.href = '/account?welcome=1';
        } else {
          showAlert(result.error || 'Registration failed. Please check information.', 'error');
        }
      } catch (err) {
        showAlert('Network or server error during registration. Please retry.', 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'CREATE ACCOUNT';
      }
    });
  }
});
