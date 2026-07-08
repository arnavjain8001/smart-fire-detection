// notificationService.js - Browser Notification Manager

class NotificationService {
    constructor() {
        this.hasRequestedThisSession = false;
    }

    requestPermission() {
        if (this.hasRequestedThisSession) return;
        if (!("Notification" in window)) {
            console.warn("This browser does not support desktop notifications.");
            return;
        }

        if (Notification.permission !== "granted" && Notification.permission !== "denied") {
            this.hasRequestedThisSession = true;
            Notification.requestPermission().then(permission => {
                console.log("Notification permission requested. Decision:", permission);
            });
        }
    }

    show(title, body) {
        if (!("Notification" in window)) return;

        if (Notification.permission === "granted") {
            try {
                // Display the native browser notification
                new Notification(title, {
                    body: body,
                    icon: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23b91c1c'><path d='M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z'/></svg>"
                });
            } catch (error) {
                console.error("Failed to show system notification:", error);
            }
        } else if (Notification.permission !== "denied") {
            // If they haven't explicitly denied, prompt them once
            this.requestPermission();
        }
    }
}

// Global service instance
const notificationService = new NotificationService();
window.notificationService = notificationService;
