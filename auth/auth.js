/**
 * Smart Fire Detection System - Authentication JS
 * Handles form validation, user registration simulation (localStorage),
 * responsive UI interactions, and visual feedback transitions.
 * 
 * Swappable with Firebase Authentication.
 * Integrated into Fire_Detection_UI from Login_Page project.
 */

// =========================================================================
// 1. AUTH SERVICE INTERFACE (Swap this with Firebase Auth later)
// =========================================================================
class MockAuthService {
  constructor() {
    this.STORAGE_KEY = 'fire_detection_users';
    this.SESSION_KEY = 'fire_detection_session';
  }

  /**
   * Retrieves all registered mock users from localStorage.
   */
  _getUsers() {
    try {
      const usersJson = localStorage.getItem(this.STORAGE_KEY);
      return usersJson ? JSON.parse(usersJson) : {};
    } catch (e) {
      console.error("Error reading from storage", e);
      return {};
    }
  }

  /**
   * Saves updated users to localStorage.
   */
  _saveUsers(users) {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(users));
    } catch (e) {
      console.error("Error saving to storage", e);
      throw new Error("Failed to write to local storage.");
    }
  }

  /**
   * Simulates Firebase User Registration.
   */
  async signUp(fullName, email, password) {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 800));

    const users = this._getUsers();
    const formattedEmail = email.toLowerCase().trim();

    if (users[formattedEmail]) {
      throw new Error("An account with this email already exists.");
    }

    // Save mock user credentials
    users[formattedEmail] = {
      fullName: fullName.trim(),
      password: password
    };
    this._saveUsers(users);

    return { success: true };
  }

  /**
   * Simulates Firebase User Sign In.
   */
  async login(email, password) {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 800));

    const users = this._getUsers();
    const formattedEmail = email.toLowerCase().trim();
    const user = users[formattedEmail];

    if (!user || user.password !== password) {
      throw new Error("Invalid email or password.");
    }

    // Create session
    localStorage.setItem(this.SESSION_KEY, JSON.stringify({
      email: formattedEmail,
      fullName: user.fullName,
      loggedInAt: new Date().toISOString()
    }));

    return { success: true, user: { email: formattedEmail, fullName: user.fullName } };
  }

  /**
   * Logs out the user.
   */
  logout() {
    localStorage.removeItem(this.SESSION_KEY);
  }
}

// Instantiate auth service instance
const authService = new MockAuthService();

// =========================================================================
// 2. UI UTILITIES & INTERACTIVE COMPONENTS
// =========================================================================
const UIHelper = {
  /**
   * Creates and displays a premium dynamic toast alert on the screen.
   * @param {string} title - The header of the alert (e.g. "Success", "Error")
   * @param {string} message - The explanatory message body
   * @param {'success'|'error'} type - Style of the alert
   */
  showToast(title, message, type = 'success') {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    // SVG icons based on toast alert type
    const iconSvg = type === 'success' 
      ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`
      : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;

    toast.innerHTML = `
      <div class="toast-icon ${type}">${iconSvg}</div>
      <div class="toast-content">
        <div class="toast-title">${title}</div>
        <div class="toast-message">${message}</div>
      </div>
      <button class="toast-close" aria-label="Close message">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
    `;

    container.appendChild(toast);

    // Toast auto-destruction timeline
    const duration = 5000;
    const fadeOutDelay = 300;

    const removeToast = () => {
      toast.classList.add('toast-fadeOut');
      setTimeout(() => {
        toast.remove();
      }, fadeOutDelay);
    };

    const autoRemoveTimer = setTimeout(removeToast, duration);

    // Close button event
    toast.querySelector('.toast-close').addEventListener('click', () => {
      clearTimeout(autoRemoveTimer);
      removeToast();
    });
  },

  /**
   * Toggles the visibility state of password fields
   */
  togglePasswordVisibility(button, fieldId) {
    const input = document.getElementById(fieldId);
    if (!input) return;

    const isPassword = input.type === 'password';
    input.type = isPassword ? 'text' : 'password';
    button.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');

    // Update eye icon SVG
    button.innerHTML = isPassword
      ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`
      : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
  },

  /**
   * Sets/removes invalid status styling and display on form controls.
   */
  setFieldError(inputElement, errorMessage) {
    const group = inputElement.closest('.form-group');
    if (!group) return;

    if (errorMessage) {
      group.classList.add('has-error');
      inputElement.classList.add('is-invalid');
      
      let errorMsgElement = group.querySelector('.validation-error-msg');
      if (!errorMsgElement) {
        errorMsgElement = document.createElement('div');
        errorMsgElement.className = 'validation-error-msg';
        group.appendChild(errorMsgElement);
      }
      errorMsgElement.textContent = errorMessage;
    } else {
      group.classList.remove('has-error');
      inputElement.classList.remove('is-invalid');
    }
  },

  /**
   * Clears errors on field focus/edit
   */
  clearFieldError(inputElement) {
    this.setFieldError(inputElement, null);
  },

  /**
   * Updates UI components of buttons to reflect load operations.
   */
  setLoadingState(buttonElement, isLoading) {
    if (!buttonElement) return;
    if (isLoading) {
      buttonElement.classList.add('is-loading');
      buttonElement.disabled = true;
    } else {
      buttonElement.classList.remove('is-loading');
      buttonElement.disabled = false;
    }
  }
};

// =========================================================================
// 3. FRONT-END VALIDATION CRITERIA
// =========================================================================
const ValidationRules = {
  isValidEmail(email) {
    // Standard robust email validation regular expression
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(email);
  },

  checkPasswordStrength(password) {
    let score = 0;
    if (!password) return { score: 0, label: 'Weak', color: 'var(--color-error)' };

    if (password.length >= 8) score++;
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;

    let label = 'Weak';
    let color = 'var(--color-error)';

    if (score === 2 || score === 3) {
      label = 'Medium';
      color = 'var(--color-secondary)';
    } else if (score === 4) {
      label = 'Strong';
      color = 'var(--color-success)';
    }

    return { score, label, color };
  }
};

// =========================================================================
// 4. MAIN FLOWS INITIALIZATION
// =========================================================================
document.addEventListener('DOMContentLoaded', () => {
  
  // A. Determine current screen context
  const loginForm = document.getElementById('loginForm');
  const signupForm = document.getElementById('signupForm');

  // B. Setup common password visible toggle triggers
  document.querySelectorAll('.password-toggle-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = btn.getAttribute('data-target');
      UIHelper.togglePasswordVisibility(btn, targetId);
    });
  });

  // C. Watch and clear input field invalid styling upon manual correction
  document.querySelectorAll('.form-control').forEach(input => {
    input.addEventListener('input', () => {
      UIHelper.clearFieldError(input);
    });
  });

  // ==========================================
  // LOGIN FORM ACTIONS
  // ==========================================
  if (loginForm) {
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const submitBtn = loginForm.querySelector('.auth-btn');

    // C.1 check URL params for successful signups
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('signup') === 'success') {
      UIHelper.showToast(
        "Account Created", 
        "Account created successfully. Please login.", 
        "success"
      );
      // Clean query parameter history in browser
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      let isValid = true;

      // Reset field errors
      UIHelper.clearFieldError(emailInput);
      UIHelper.clearFieldError(passwordInput);

      // Email field checks
      const emailValue = emailInput.value.trim();
      if (!emailValue) {
        UIHelper.setFieldError(emailInput, "Email is required.");
        isValid = false;
      } else if (!ValidationRules.isValidEmail(emailValue)) {
        UIHelper.setFieldError(emailInput, "Please enter a valid email address.");
        isValid = false;
      }

      // Password field checks
      const passwordValue = passwordInput.value;
      if (!passwordValue) {
        UIHelper.setFieldError(passwordInput, "Password is required.");
        isValid = false;
      }

      if (!isValid) return;

      // Submit execution
      try {
        UIHelper.setLoadingState(submitBtn, true);
        
        await authService.login(emailValue, passwordValue);
        
        UIHelper.showToast("Login Successful", "Redirecting to Dashboard...", "success");
        
        // Redirect user to index.html dashboard (after a brief moment to show success state)
        setTimeout(() => {
          window.location.href = '../index.html';
        }, 1200);

      } catch (err) {
        UIHelper.setLoadingState(submitBtn, false);
        UIHelper.showToast("Authentication Failed", err.message, "error");
      }
    });
  }

  // ==========================================
  // SIGN UP FORM ACTIONS
  // ==========================================
  if (signupForm) {
    const nameInput = document.getElementById('fullname');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const confirmPasswordInput = document.getElementById('confirmPassword');
    const submitBtn = signupForm.querySelector('.auth-btn');
    
    const strengthMeter = document.querySelector('.password-strength-meter');
    const strengthBar = document.querySelector('.password-strength-bar');
    const strengthLabel = document.querySelector('.password-strength-label');

    // Real-time password strength analyzer feedback
    if (passwordInput && strengthMeter && strengthBar && strengthLabel) {
      passwordInput.addEventListener('input', () => {
        const value = passwordInput.value;
        if (value.length > 0) {
          strengthMeter.style.display = 'block';
          strengthLabel.style.display = 'block';
          
          const strength = ValidationRules.checkPasswordStrength(value);
          
          // Width based on score
          const widthPercent = (strength.score / 4) * 100;
          strengthBar.style.width = `${Math.max(10, widthPercent)}%`;
          strengthBar.style.backgroundColor = strength.color;
          strengthLabel.textContent = `Strength: ${strength.label}`;
          strengthLabel.style.color = strength.color;
        } else {
          strengthMeter.style.display = 'none';
          strengthLabel.style.display = 'none';
        }
      });
    }

    signupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      let isValid = true;

      // Clear previous error messages
      UIHelper.clearFieldError(nameInput);
      UIHelper.clearFieldError(emailInput);
      UIHelper.clearFieldError(passwordInput);
      UIHelper.clearFieldError(confirmPasswordInput);

      // Name check
      const nameValue = nameInput.value.trim();
      if (!nameValue) {
        UIHelper.setFieldError(nameInput, "Full Name is required.");
        isValid = false;
      }

      // Email check
      const emailValue = emailInput.value.trim();
      if (!emailValue) {
        UIHelper.setFieldError(emailInput, "Email is required.");
        isValid = false;
      } else if (!ValidationRules.isValidEmail(emailValue)) {
        UIHelper.setFieldError(emailInput, "Please enter a valid email address.");
        isValid = false;
      }

      // Password checks
      const passwordValue = passwordInput.value;
      if (!passwordValue) {
        UIHelper.setFieldError(passwordInput, "Password is required.");
        isValid = false;
      } else if (passwordValue.length < 8) {
        UIHelper.setFieldError(passwordInput, "Password must be at least 8 characters long.");
        isValid = false;
      } else {
        const strength = ValidationRules.checkPasswordStrength(passwordValue);
        if (strength.score < 2) {
          UIHelper.setFieldError(passwordInput, "Password is too weak. Try including numbers and symbols.");
          isValid = false;
        }
      }

      // Confirm Password checks
      const confirmValue = confirmPasswordInput.value;
      if (!confirmValue) {
        UIHelper.setFieldError(confirmPasswordInput, "Please confirm your password.");
        isValid = false;
      } else if (passwordValue !== confirmValue) {
        UIHelper.setFieldError(confirmPasswordInput, "Passwords do not match.");
        isValid = false;
      }

      if (!isValid) return;

      // Submit execution
      try {
        UIHelper.setLoadingState(submitBtn, true);

        await authService.signUp(nameValue, emailValue, passwordValue);

        UIHelper.showToast("Registration Complete", "Transferring to login page...", "success");

        // Redirect back to login with success search parameter (giving time for the toast)
        setTimeout(() => {
          window.location.href = './login.html?signup=success';
        }, 1200);

      } catch (err) {
        UIHelper.setLoadingState(submitBtn, false);
        UIHelper.showToast("Registration Failed", err.message, "error");
      }
    });
  }
});
