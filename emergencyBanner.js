// emergencyBanner.js - Flashing Sticky Top Banner Component

class EmergencyBanner {
    constructor() {
        this.container = null;
        this.isVisible = false;
    }

    init() {
        // Ensure container is created at the absolute top of the body
        this.container = document.getElementById('emergency-banner-container');
        if (!this.container) {
            this.container = document.createElement('div');
            this.container.id = 'emergency-banner-container';
            document.body.insertBefore(this.container, document.body.firstChild);
        }
    }

    show() {
        this.init();
        if (this.isVisible) return;

        this.container.innerHTML = `
            <div class="emergency-banner" role="alert" aria-live="assertive">
                🚨 EMERGENCY • FIRE DETECTED • EVACUATE IMMEDIATELY
            </div>
        `;
        document.body.classList.add('emergency-active');
        this.isVisible = true;
    }

    hide() {
        if (!this.isVisible) return;
        
        if (this.container) {
            this.container.innerHTML = '';
        }
        document.body.classList.remove('emergency-active');
        this.isVisible = false;
    }
}

// Global component instance
const emergencyBanner = new EmergencyBanner();
window.emergencyBanner = emergencyBanner;
