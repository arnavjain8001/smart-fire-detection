// emergencyPopup.js - Fullscreen Emergency Warning Popup Component

class EmergencyPopup {
    constructor() {
        this.overlay = null;
        this.autoCloseTimeout = null;
        this.keydownHandler = null;
        this.onCloseCallbacks = [];
        this.onViewDashboardCallbacks = [];
        this.isVisible = false;
    }

    show(severity, onClose, onViewDashboard) {
        // If already showing, just update severity content in-place without restarting animations/sound
        if (this.isVisible && this.overlay) {
            const valEl = this.overlay.querySelector('#popup-severity');
            if (valEl) {
                valEl.className = `severity-value ${severity.toLowerCase()}`;
                valEl.textContent = severity.toUpperCase();
            }
            return;
        }

        // Clean up any stray instances
        this.close();

        this.onCloseCallbacks = onClose ? [onClose] : [];
        this.onViewDashboardCallbacks = onViewDashboard ? [onViewDashboard] : [];
        this.isVisible = true;

        // Apply scroll lock and dim/blur to background
        document.body.classList.add('popup-open');

        // Create overlay element
        this.overlay = document.createElement('div');
        this.overlay.className = 'emergency-overlay';
        this.overlay.id = 'emergency-popup-overlay';
        this.overlay.setAttribute('role', 'dialog');
        this.overlay.setAttribute('aria-modal', 'true');
        this.overlay.setAttribute('aria-labelledby', 'popup-title');

        const severityClass = severity.toLowerCase();

        this.overlay.innerHTML = `
            <div class="emergency-card shake-anim" id="emergency-popup-card">
                <div class="emergency-badge">🚨</div>
                <h2 id="popup-title">🚨 FIRE DETECTED</h2>
                <p class="emergency-subtitle">A fire has been detected by the Smart Fire Detection System.</p>

                <div class="severity-container">
                    <span class="severity-label">FIRE SEVERITY</span>
                    <span class="severity-value ${severityClass}" id="popup-severity">${severity.toUpperCase()}</span>
                </div>

                <div class="safety-instructions">
                    <div class="instruction-item">
                        <span class="instruction-icon">🧘</span>
                        <span>Stay Calm.</span>
                    </div>
                    <div class="instruction-item">
                        <span class="instruction-icon">🏃</span>
                        <span>Please evacuate the building immediately.</span>
                    </div>
                    <div class="instruction-item">
                        <span class="instruction-icon">🛗</span>
                        <span>Avoid using elevators.</span>
                    </div>
                    <div class="instruction-item">
                        <span class="instruction-icon">🚪</span>
                        <span>Use the nearest emergency exit.</span>
                    </div>
                    <div class="instruction-item">
                        <span class="instruction-icon">📞</span>
                        <span>Emergency response has been notified.</span>
                    </div>
                    <div class="instruction-item">
                        <span class="instruction-icon">📋</span>
                        <span>Follow all safety instructions.</span>
                    </div>
                </div>

                <div class="popup-actions">
                    <button class="btn-emergency-primary" id="popup-btn-ok" aria-label="Acknowledge alert and close popup">✔ OK</button>
                    <button class="btn-emergency-secondary" id="popup-btn-dashboard" aria-label="View Dashboard and close popup">📊 View Dashboard</button>
                </div>
            </div>
        `;

        document.body.appendChild(this.overlay);

        // Remove shake animation class after it plays once so it doesn't loop
        const card = this.overlay.querySelector('#emergency-popup-card');
        card.addEventListener('animationend', (e) => {
            if (e.animationName === 'emergencyShake') {
                card.classList.remove('shake-anim');
            }
        });

        // Trigger visual fade-in transition
        setTimeout(() => {
            if (this.overlay) {
                this.overlay.classList.add('visible');
            }
        }, 10);

        // Cache references
        const okBtn = this.overlay.querySelector('#popup-btn-ok');
        const dashBtn = this.overlay.querySelector('#popup-btn-dashboard');

        // Button Click handlers
        okBtn.addEventListener('click', () => {
            this.handleUserInteraction();
            this.close();
            this.onCloseCallbacks.forEach(cb => cb());
        });

        dashBtn.addEventListener('click', () => {
            this.handleUserInteraction();
            this.close();
            this.onViewDashboardCallbacks.forEach(cb => cb());
        });

        // Disallow modal dismiss on outside background clicks (industrial protocol safety)
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) {
                e.stopPropagation();
                e.preventDefault();
            }
        });

        // Keyboard accessibility: ESC key close and Focus Trap
        this.keydownHandler = (e) => {
            this.handleUserInteraction();

            if (e.key === 'Escape') {
                this.close();
                this.onCloseCallbacks.forEach(cb => cb());
                return;
            }

            if (e.key === 'Tab') {
                const focusables = [okBtn, dashBtn];
                const firstFocusable = focusables[0];
                const lastFocusable = focusables[focusables.length - 1];

                if (e.shiftKey) { // Shift + Tab
                    if (document.activeElement === firstFocusable || !focusables.includes(document.activeElement)) {
                        lastFocusable.focus();
                        e.preventDefault();
                    }
                } else { // Tab
                    if (document.activeElement === lastFocusable || !focusables.includes(document.activeElement)) {
                        firstFocusable.focus();
                        e.preventDefault();
                    }
                }
            }
        };
        window.addEventListener('keydown', this.keydownHandler, true);

        // General click observer to cancel auto-close timer if user interacts with anything inside card
        this.clickInteractionHandler = () => this.handleUserInteraction();
        this.overlay.addEventListener('click', this.clickInteractionHandler);

        // Initial focus
        okBtn.focus();

        // Start 10-second automatic closure timer
        this.startAutoCloseTimer();
    }

    startAutoCloseTimer() {
        this.autoCloseTimeout = setTimeout(() => {
            this.close();
            this.onCloseCallbacks.forEach(cb => cb());
        }, 10000);
    }

    handleUserInteraction() {
        if (this.autoCloseTimeout) {
            clearTimeout(this.autoCloseTimeout);
            this.autoCloseTimeout = null;
        }
    }

    close() {
        if (!this.overlay) {
            this.isVisible = false;
            return;
        }

        const overlayToRemove = this.overlay;
        this.overlay = null;
        this.isVisible = false;

        // Clear listeners & timers
        if (this.autoCloseTimeout) {
            clearTimeout(this.autoCloseTimeout);
            this.autoCloseTimeout = null;
        }

        if (this.keydownHandler) {
            window.removeEventListener('keydown', this.keydownHandler, true);
            this.keydownHandler = null;
        }

        if (this.clickInteractionHandler && overlayToRemove) {
            overlayToRemove.removeEventListener('click', this.clickInteractionHandler);
            this.clickInteractionHandler = null;
        }

        // Restore scroll and background filters
        document.body.classList.remove('popup-open');

        // Smooth Fade Out
        overlayToRemove.classList.remove('visible');
        setTimeout(() => {
            if (overlayToRemove.parentNode) {
                overlayToRemove.parentNode.removeChild(overlayToRemove);
            }
        }, 300); // matches CSS transition duration
    }
}

// Global component instance
const emergencyPopup = new EmergencyPopup();
window.emergencyPopup = emergencyPopup;
