// app.js - Smart Fire Detection Dashboard Controller

// System State Variables
let systemState = 'SAFE'; // 'SAFE', 'WARNING', 'CRITICAL'
let currentTab = 'dashboard';

// User Profile State
let userProfile = {
    username: 'Arnav Jain',
    email: 'arnavjain@example.com'
};

// Sensor values
let sensors = {
    temp: { val: 24.5, peak: 24.5, min: 24.5, status: 'SAFE', active: true, key: 'temperature' },
    smoke: { val: 12.1, peak: 12.1, min: 12.1, status: 'SAFE', active: true, key: 'smoke' },
    flame: { val: 0.0, peak: 0.0, min: 0.0, status: 'SAFE', active: true, key: 'flame' }
};

// Device status states (WiFi / ESP32 Board / Actuator Pump)
let deviceHealth = {
    tempSensor: 'Active',
    smokeSensor: 'Active',
    flameSensor: 'Active',
    esp32: 'Connected',
    wifi: 'Connected',
    pump: 'Ready'
};

// Safety Threshold Limits (Adjustable via Settings)
let thresholds = {
    temp: 60.0,
    smoke: 40.0,
    flame: 1.50
};

// System Controls
let autoMode = true;
let sprinklerActive = false;
let emergencyOverride = false;

// Simulated Firebase database integration
const firebaseDb = {
    ref: function(path) {
        return {
            push: function(data) {
                let list = JSON.parse(localStorage.getItem(path) || '[]');
                list.unshift(data); // latest first
                localStorage.setItem(path, JSON.stringify(list));
                return { key: 'mock-key-' + Date.now() };
            },
            get: function() {
                return JSON.parse(localStorage.getItem(path) || '[]');
            },
            set: function(data) {
                localStorage.setItem(path, JSON.stringify(data));
            }
        };
    }
};

let activeAlerts = [];
let incidentStage = 0; // 0=None, 1=Building Up, 2=Critical peak, 3=Cooldown

// Chart.js instances
let mainChart = null;
let tempChart = null;
let smokeChart = null;
let flameChart = null;

// Chart Data buffers (sliding window of last 20 ticks)
const maxTicks = 20;
let chartLabels = Array.from({length: maxTicks}, (_, i) => '');
let chartTempData = Array(maxTicks).fill(24.5);
let chartSmokeData = Array(maxTicks).fill(12.1);
let chartFlameData = Array(maxTicks).fill(0.0);

// Initialize application on DOM load
document.addEventListener("DOMContentLoaded", () => {
    // Start Clock
    updateClock();
    setInterval(updateClock, 1000);
    
    // Seed initial history logs
    seedIncidentsHistory();

    // Initialize Charts
    initCharts();
    
    // Start real-time sensor loop (runs every second)
    setInterval(sensorTelemetryLoop, 1000);

    // Initialize control inputs with JS state (check if elements exist)
    const sprinklerToggle = document.getElementById('sprinkler-toggle');
    if (sprinklerToggle) sprinklerToggle.checked = sprinklerActive;
    
    const autoModeToggle = document.getElementById('auto-mode-toggle');
    if (autoModeToggle) autoModeToggle.checked = autoMode;

    // Load initial history view
    renderIncidentsHistory();

    // Fetch latest fire alert info
    fetchLatestAlertData();

    // Close user dropdown menu when clicking outside
    window.addEventListener('click', (e) => {
        const trigger = document.getElementById('profile-dropdown-trigger');
        if (trigger && !trigger.contains(e.target)) {
            document.getElementById('profile-dropdown').classList.remove('show');
        }
    });
});

// Update Clock
function updateClock() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    document.getElementById('realtime-clock').textContent = timeStr;
}

// Switch between dashboard pages/tabs
function switchTab(tabId) {
    // Remove active state from all nav buttons
    document.querySelectorAll('.nav-tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Highlight matching tab button
    const activeBtn = document.getElementById(`btn-tab-${tabId}`);
    if (activeBtn) activeBtn.classList.add('active');

    // Hide all pages, show target
    document.querySelectorAll('.page-section').forEach(section => {
        section.classList.remove('active');
    });
    
    const targetSection = document.getElementById(`page-${tabId}`);
    if (targetSection) targetSection.classList.add('active');
    
    currentTab = tabId;

    // Close profile dropdown if opened
    document.getElementById('profile-dropdown').classList.remove('show');

    // Force Charts redraw to fit panel size container
    setTimeout(() => {
        if (tabId === 'dashboard' && mainChart) mainChart.update();
        if (tabId === 'sensors') {
            if (tempChart) tempChart.update();
            if (smokeChart) smokeChart.update();
            if (flameChart) flameChart.update();
        }
    }, 50);
}

// User Profile Actions
function toggleProfileDropdown() {
    document.getElementById('profile-dropdown').classList.toggle('show');
}

// Username edit activation
function enableUsernameEditing() {
    const input = document.getElementById('profile-username-input');
    const saveBtnContainer = document.getElementById('profile-save-container');
    const editBtn = document.getElementById('btn-edit-username');

    input.disabled = false;
    input.focus();
    input.select();
    saveBtnContainer.style.display = 'block';
    
    // Switch icon to checkmark/confirm
    editBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
}

function saveUsernameChanges() {
    const input = document.getElementById('profile-username-input');
    const saveBtnContainer = document.getElementById('profile-save-container');
    const editBtn = document.getElementById('btn-edit-username');

    if (input.value.trim() === '') {
        alert('Username cannot be empty.');
        return;
    }

    userProfile.username = input.value.trim();
    
    // Update navigation readout
    document.getElementById('nav-username').textContent = userProfile.username;
    
    // Update initials in avatars
    const initials = userProfile.username.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
    document.getElementById('nav-avatar-img').textContent = initials;
    document.getElementById('profile-avatar-large').textContent = initials;

    // Lock input
    input.disabled = true;
    saveBtnContainer.style.display = 'none';
    editBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>`;

    // Log the change
    addResponseActionLog('PROFILE', 'Username updated.');
}

function triggerPhotoChange() {
    // Generate random avatar colors to simulate photo change
    const colors = ['#06b6d4', '#10b981', '#f59e0b', '#3b82f6', '#8b5cf6', '#ec4899'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    
    const avatar1 = document.getElementById('nav-avatar-img');
    const avatar2 = document.getElementById('profile-avatar-large');
    
    avatar1.style.backgroundColor = randomColor;
    avatar1.style.color = '#06080c';
    avatar2.style.backgroundColor = randomColor;
    avatar2.style.color = '#06080c';

    addResponseActionLog('PROFILE', 'Photo updated.');
}

function triggerLogout() {
    if (confirm('Are you sure you want to log out of FireShield SCADA core?')) {
        resetEntireSystemState();
        switchTab('dashboard');
        alert('You have logged out. (Session variables reset)');
    }
}

// Generate realistic fluctuating environmental variables
function sensorTelemetryLoop() {
    simulateJitterDeviceHealth();

    let deltaTemp = (Math.random() - 0.5) * 0.4;
    let deltaSmoke = (Math.random() - 0.5) * 0.3;
    let deltaFlame = 0;

    // Simulated Incident behavior tree
    if (incidentStage === 1) { // Alert building up
        deltaTemp = Math.random() * 2.5 + 0.5; // Rapid heating
        deltaSmoke = Math.random() * 2.0 + 0.4; // Rapid smoke accumulation
        if (sensors.temp.val > 40) {
            deltaFlame = Math.random() * 0.15 + 0.05; // Fire ignites
        }
    } 
    else if (incidentStage === 2) { // Critical peak
        if (sprinklerActive) {
            // Sprinkler cooling impact
            deltaTemp = -Math.random() * 3.5 - 1.0; 
            deltaSmoke = -Math.random() * 2.0 + 0.5; // Steam + lingering smoke
            deltaFlame = -Math.random() * 0.25 - 0.1;
        } else {
            deltaTemp = (Math.random() - 0.2) * 1.5;
            deltaSmoke = (Math.random() - 0.2) * 1.0;
            deltaFlame = (Math.random() - 0.2) * 0.1;
        }
    } 
    else if (incidentStage === 3) { // Cooldown phase
        deltaTemp = -Math.random() * 1.5 - 0.5;
        deltaSmoke = -Math.random() * 1.0 - 0.5;
        deltaFlame = -0.15;
    }

    // Apply adjustments
    sensors.temp.val = Math.max(18.0, Math.min(120.0, sensors.temp.val + deltaTemp));
    sensors.smoke.val = Math.max(5.0, Math.min(99.0, sensors.smoke.val + deltaSmoke));
    sensors.flame.val = Math.max(0.0, Math.min(5.0, sensors.flame.val + deltaFlame));

    // Handle stage escalation conditions
    if (incidentStage === 1 && (sensors.temp.val >= thresholds.temp || sensors.smoke.val >= thresholds.smoke || sensors.flame.val >= thresholds.flame)) {
        incidentStage = 2; // Hit critical escalation
        addResponseActionLog('ESCALATION', 'Sensor thresholds breached. Automated sprinkler deployment triggered.');
    }
    
    if (incidentStage === 2 && sprinklerActive && sensors.temp.val <= 32 && sensors.smoke.val <= 18 && sensors.flame.val <= 0.05) {
        incidentStage = 3; // Threat neutralized, entering cooldown
        addResponseActionLog('CONTAINMENT', 'Hazardous telemetry lowered below threshold. Auto cooldown active.');
    }

    if (incidentStage === 3 && sensors.temp.val <= 25.5 && sensors.smoke.val <= 13.0 && sensors.flame.val === 0) {
        incidentStage = 0; // Back to normal
        addResponseActionLog('NORMAL', 'Environmental baselines restored. System threat standing down.');
    }

    // Update Session Stat Envelopes
    sensors.temp.peak = Math.max(sensors.temp.peak, sensors.temp.val);
    sensors.temp.min = Math.min(sensors.temp.min, sensors.temp.val);
    
    sensors.smoke.peak = Math.max(sensors.smoke.peak, sensors.smoke.val);
    sensors.smoke.min = Math.min(sensors.smoke.min, sensors.smoke.val);
    
    sensors.flame.peak = Math.max(sensors.flame.peak, sensors.flame.val);
    sensors.flame.min = Math.min(sensors.flame.min, sensors.flame.val);

    // Evaluate threats
    evaluateSafetyThresholds();

    // Push new data to buffers
    pushChartData();

    // Render numbers in GUI
    updateInterfaceReadouts();
}

// Simulates real-world sensor offline/waiting packets fluctuations
function simulateJitterDeviceHealth() {
    const rand = Math.random();
    
    const wifiBadge = document.getElementById('health-wifi-badge');
    const flameBadge = document.getElementById('health-flame-badge');

    if (rand < 0.04) {
        wifiBadge.textContent = '● Latency Jitter';
        wifiBadge.className = 'dev-badge dev-waiting';
        deviceHealth.wifi = 'Waiting';
    } else if (rand < 0.08) {
        wifiBadge.textContent = '● Connected';
        wifiBadge.className = 'dev-badge dev-active';
        deviceHealth.wifi = 'Connected';
    }

    if (systemState === 'CRITICAL') {
        flameBadge.textContent = '● Active';
        flameBadge.className = 'dev-badge dev-active';
        deviceHealth.flameSensor = 'Active';
    } else if (rand > 0.98) {
        flameBadge.textContent = '● Offline';
        flameBadge.className = 'dev-badge dev-offline';
        deviceHealth.flameSensor = 'Offline';
        sensors.flame.active = false;
        document.getElementById('detail-flame-conn').textContent = '● OFFLINE';
        document.getElementById('detail-flame-conn').style.color = 'var(--color-critical)';
    } else if (rand > 0.92) {
        flameBadge.textContent = '● Active';
        flameBadge.className = 'dev-badge dev-active';
        deviceHealth.flameSensor = 'Active';
        sensors.flame.active = true;
        document.getElementById('detail-flame-conn').textContent = '● ACTIVE';
        document.getElementById('detail-flame-conn').style.color = 'var(--color-safe)';
    }
}

// Evaluate values against configured warning and alarm values
function evaluateSafetyThresholds() {
    let prevSystemState = systemState;
    let maxSeverity = 'SAFE';

    // Temp Check
    if (sensors.temp.val >= thresholds.temp) {
        sensors.temp.status = 'CRITICAL';
        maxSeverity = 'CRITICAL';
    } else if (sensors.temp.val >= thresholds.temp * 0.75) {
        sensors.temp.status = 'WARNING';
        if (maxSeverity !== 'CRITICAL') maxSeverity = 'WARNING';
    } else {
        sensors.temp.status = 'SAFE';
    }

    // Smoke Check
    if (sensors.smoke.val >= thresholds.smoke) {
        sensors.smoke.status = 'CRITICAL';
        maxSeverity = 'CRITICAL';
    } else if (sensors.smoke.val >= thresholds.smoke * 0.75) {
        sensors.smoke.status = 'WARNING';
        if (maxSeverity !== 'CRITICAL') maxSeverity = 'WARNING';
    } else {
        sensors.smoke.status = 'SAFE';
    }

    // Flame Check
    if (sensors.flame.val >= thresholds.flame) {
        sensors.flame.status = 'CRITICAL';
        maxSeverity = 'CRITICAL';
    } else if (sensors.flame.val >= thresholds.flame * 0.5) {
        sensors.flame.status = 'WARNING';
        if (maxSeverity !== 'CRITICAL') maxSeverity = 'WARNING';
    } else {
        sensors.flame.status = 'SAFE';
    }

    // Override if Manual Override button was toggled
    if (emergencyOverride) {
        maxSeverity = 'CRITICAL';
    }

    systemState = maxSeverity;

    // State Transition Events
    if (prevSystemState !== systemState) {
        handleStateTransition(prevSystemState, systemState);
    }

    // Sprinkler auto action
    if (systemState === 'CRITICAL' && autoMode && !sprinklerActive) {
        activateSprinkler(true, 'AUTO-RESPONSE');
    }
}

// Handle transition between safety states
function handleStateTransition(fromState, toState) {
    const timestamp = new Date().toLocaleTimeString([], { hour12: false });
    const datestamp = new Date().toLocaleDateString();

    let title = '';
    let msg = '';
    let loc = 'Sector-A Factory Assembly Area';

    if (toState === 'CRITICAL') {
        title = 'CRITICAL BREACH DETECTED';
        msg = `Hazard levels exceeded critical limits! Temp: ${sensors.temp.val.toFixed(1)}°C, Smoke: ${sensors.smoke.val.toFixed(1)}%, Flame: ${sensors.flame.val.toFixed(2)} W/m²`;
        
        // Add log
        recordFireIncident();
        addResponseActionLog('ALARM', 'Siren Array Activated - Building Evacuation Command Sent.');
    } 
    else if (toState === 'WARNING') {
        title = 'SAFETY ENVELOPE WARNING';
        msg = `Sensors approaching limits. Inspect Area.`;
    } 
    else if (toState === 'SAFE' && fromState === 'CRITICAL') {
        title = 'THREAT DISARMED';
        msg = `All safety checks returned normal. Threat neutralized.`;
        
        // Turn off sprinklers if auto is checked
        if (autoMode && sprinklerActive) {
            activateSprinkler(false, 'AUTO-COOLDOWN');
        }
    }

    // Trigger Timeline notification
    if (toState !== 'SAFE') {
        createTimelineAlert(title, msg, toState.toLowerCase(), loc);
    }
}

// Update DOM elements based on state variables
function updateInterfaceReadouts() {
    // 1. System Health indicators
    const overlay = document.getElementById('critical-overlay');
    overlay.style.display = 'none';

    if (systemState === 'CRITICAL') {
        overlay.style.display = 'block'; // Turn flashing screen on
    }

    // 2. Dashboard status card updates
    const dashCard = document.getElementById('dashboard-status-card');
    const dashVal = document.getElementById('dashboard-status-val');
    const dashDesc = document.getElementById('dashboard-status-desc');
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    document.getElementById('dashboard-last-update').textContent = `Last Check: ${timeStr}`;

    dashCard.className = 'glass-panel status-card';
    if (systemState === 'CRITICAL') {
        dashCard.classList.add('state-critical');
        dashVal.textContent = 'CRITICAL';
        dashDesc.textContent = 'Hazard breach active! Sprinkler actuators activated. Evacuate building sector.';
    } else if (systemState === 'WARNING') {
        dashCard.classList.add('state-warning');
        dashVal.textContent = 'WARNING';
        dashDesc.textContent = 'Environmental variables are leaking past baseline levels. Site dispatch advised.';
    } else {
        dashCard.classList.add('state-safe');
        dashVal.textContent = 'SAFE';
        dashDesc.textContent = 'All safety variables operating inside baseline security envelopes.';
    }

    // 3. Sensor display panels
    // Temp
    updateSensorPanelHTML('temp', '🌡️', '°C');
    // Smoke
    updateSensorPanelHTML('smoke', '💨', '%');
    // Flame
    updateSensorPanelHTML('flame', '🔥', ' W/m²');

    // 4. Update timeline alert indicator count
    const badge = document.getElementById('alerts-count-badge');
    const activeCount = activeAlerts.filter(a => a.severity === 'high' || a.severity === 'medium').length;
    if (activeCount > 0) {
        badge.textContent = activeCount;
        badge.style.display = 'inline-block';
    } else {
        badge.style.display = 'none';
    }

    // 5. Update Sprinkler status visual card (removed from UI, wrapped to prevent errors)
    const sprinklerCard = document.getElementById('sprinkler-status-card');
    if (sprinklerCard) {
        const sprinklerTitle = document.getElementById('sprinkler-status-title');
        const sprinklerLbl = document.getElementById('sprinkler-status-lbl');
        
        sprinklerCard.className = 'glass-panel sprinkler-card';
        if (sprinklerActive) {
            sprinklerCard.classList.add('active');
            if (systemState === 'CRITICAL') sprinklerCard.classList.add('alert-danger');
            if (sprinklerTitle) sprinklerTitle.textContent = 'Sprinkler Pump Running';
            if (sprinklerLbl) sprinklerLbl.textContent = 'DISCHARGING WATER';
        } else {
            if (sprinklerTitle) sprinklerTitle.textContent = 'Sprinkler Pump Standby';
            if (sprinklerLbl) sprinklerLbl.textContent = 'DEACTIVATED';
        }
    }

    const warningIndicator = document.getElementById('emergency-warning-indicator');
    if (warningIndicator) {
        if (systemState === 'CRITICAL') {
            warningIndicator.textContent = 'HAZARD ACTIVE';
            warningIndicator.style.color = 'var(--color-critical)';
        } else if (systemState === 'WARNING') {
            warningIndicator.textContent = 'INTEGRITY ABNORMAL';
            warningIndicator.style.color = 'var(--color-warn)';
        } else {
            warningIndicator.textContent = 'NOMINAL';
            warningIndicator.style.color = 'var(--color-safe)';
        }
    }

    const threatLevel = document.getElementById('emergency-threat-level');
    if (threatLevel) {
        if (systemState === 'CRITICAL') {
            threatLevel.textContent = 'CRITICAL';
            threatLevel.style.color = 'var(--color-critical)';
        } else if (systemState === 'WARNING') {
            threatLevel.textContent = 'WARNING';
            threatLevel.style.color = 'var(--color-warn)';
        } else {
            threatLevel.textContent = 'SAFE';
            threatLevel.style.color = 'var(--color-safe)';
        }
    }

    // 6. Sync UI Checkbox indicators
    const sprinklerToggle = document.getElementById('sprinkler-toggle');
    if (sprinklerToggle) sprinklerToggle.checked = sprinklerActive;
    
    // Update pump status badge in Health status list
    const pumpBadge = document.getElementById('health-pump-badge');
    if (pumpBadge) {
        if (sprinklerActive) {
            pumpBadge.textContent = '● ACTIVE';
            pumpBadge.className = 'dev-badge dev-offline';
        } else {
            pumpBadge.textContent = '● Ready';
            pumpBadge.className = 'dev-badge dev-active';
        }
    }

    // 7. Update Latest Fire Alert Card if loaded
    if (latestAlertLoaded) {
        updateLatestAlertCard();
    }
}

// Utility to populate sensor card details
function updateSensorPanelHTML(id, icon, unit) {
    const data = sensors[id];
    // Dashboard Mini updates
    const miniVal = document.getElementById(`mini-${id}`);
    const miniStatus = document.getElementById(`mini-${id}-status`);

    miniVal.textContent = data.val.toFixed(id === 'flame' ? 2 : 1);
    miniStatus.textContent = data.status;
    miniStatus.className = `sensor-mini-status ${data.status.toLowerCase()}`;

    // Sensors Details Page updates
    const detVal = document.getElementById(`detail-${id}-val`);
    const detDot = document.getElementById(`detail-${id}-dot`);
    const detLbl = document.getElementById(`detail-${id}-status-lbl`);
    const detPeak = document.getElementById(`detail-${id}-peak`);
    const detThresh = document.getElementById(`detail-${id}-threshold`);

    if (detVal) {
        detVal.textContent = data.val.toFixed(id === 'flame' ? 2 : 1);
        detPeak.textContent = `${data.peak.toFixed(id === 'flame' ? 2 : 1)}${unit}`;
        if (detThresh) detThresh.textContent = `${thresholds[id].toFixed(id === 'flame' ? 2 : 1)}${unit}`;

        detDot.className = 'status-dot';
        if (data.status === 'CRITICAL') {
            detDot.classList.add('critical');
            detLbl.textContent = 'CRITICAL LIMIT BREACHED';
            detLbl.style.color = 'var(--color-critical)';
        } else if (data.status === 'WARNING') {
            detDot.classList.add('warning');
            detLbl.textContent = 'ABNORMAL DEVIATION WARNING';
            detLbl.style.color = 'var(--color-warn)';
        } else {
            detDot.classList.add('safe');
            detLbl.textContent = 'Safe Operational Range';
            detLbl.style.color = 'var(--color-safe)';
        }
    }
}

// Chart.js updates sliding window
function pushChartData() {
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    
    // Shift arrays
    chartLabels.push(timestamp);
    chartLabels.shift();

    chartTempData.push(sensors.temp.val);
    chartTempData.shift();

    chartSmokeData.push(sensors.smoke.val);
    chartSmokeData.shift();

    chartFlameData.push(sensors.flame.val);
    chartFlameData.shift();

    // Update charts if initialized
    if (mainChart && currentTab === 'dashboard') {
        mainChart.update('none'); // Update without animation for performance
    }

    if (currentTab === 'sensors') {
        if (tempChart) tempChart.update('none');
        if (smokeChart) smokeChart.update('none');
        if (flameChart) flameChart.update('none');
    }
}

// Trigger sprinkler activation
function toggleSprinkler(active) {
    if (active === sprinklerActive) return;
    activateSprinkler(active, 'MANUAL-OVERRIDE');
}

// Trigger Auto Safety toggle
function toggleAutoMode(active) {
    autoMode = active;
    const action = active ? 'ENABLED' : 'DISABLED';
    addResponseActionLog('MODE-CHANGE', `Auto Fire Defense ${action}.`);
    

}

// Execute actuator state shifts
function activateSprinkler(active, source = 'MANUAL-OVERRIDE') {
    sprinklerActive = active;
    
    const timestamp = new Date().toLocaleTimeString([], { hour12: false });
    const datestamp = new Date().toLocaleDateString();

    const actionText = active ? 'Water discharge initiated' : 'Discharge terminated';
    const logSeverity = active ? (systemState === 'CRITICAL' ? 'CRITICAL' : 'WARNING') : 'SAFE';


    
    // Trigger alert or info log
    addResponseActionLog(active ? 'ACTUATOR-ON' : 'ACTUATOR-OFF', `Sprinklers ${active ? 'activated' : 'closed'} via ${source}`);

    // Update timeline alerts
    if (active) {
        createTimelineAlert(
            'SPRINKLERS ENGAGED', 
            `Water discharge commenced via ${source} protocols.`, 
            'info', 
            'All Sectors - Ceilings'
        );
    }
    
    updateInterfaceReadouts();
}

// Manual Override Button - Force System Critical Mode / Evacuation
function triggerManualOverride() {
    emergencyOverride = !emergencyOverride;
    const btn = document.getElementById('emergency-override-btn');

    if (btn) {
        if (emergencyOverride) {
            btn.classList.add('active');
            btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg> Cancel Override`;
        } else {
            btn.classList.remove('active');
            btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg> Emergency Override`;
        }
    }
    evaluateSafetyThresholds();
}

// Settings Threshold Sliders Event Handler (disabled since page-settings was removed)
function updateThresholdsFromSliders() {
    const tempSl = document.getElementById('threshold-temp-range');
    const smokeSl = document.getElementById('threshold-smoke-range');
    const flameSl = document.getElementById('threshold-flame-range');

    if (tempSl) thresholds.temp = parseFloat(tempSl.value);
    if (smokeSl) thresholds.smoke = parseFloat(smokeSl.value);
    if (flameSl) thresholds.flame = parseFloat(flameSl.value) / 100.0;

    const lblTemp = document.getElementById('lbl-temp-threshold');
    const lblSmoke = document.getElementById('lbl-smoke-threshold');
    const lblFlame = document.getElementById('lbl-flame-threshold');

    if (lblTemp) lblTemp.textContent = thresholds.temp;
    if (lblSmoke) lblSmoke.textContent = thresholds.smoke;
    if (lblFlame) lblFlame.textContent = thresholds.flame.toFixed(2);

    evaluateSafetyThresholds();
    updateInterfaceReadouts();
}

// Trigger mock fire diagnostic incident
function runDiagnosticTest() {
    if (incidentStage !== 0) return;
    
    // Switch to dashboard
    switchTab('dashboard');

    incidentStage = 1; // start build-up
    addResponseActionLog('DIAGNOSTICS', 'Mock hazard drill simulation initialized.');
    
    createTimelineAlert(
        'DRILL TESTING COMMENCED',
        'Diagnostics safety simulation active. Monitoring sensor behavior.',
        'info',
        'System Diagnostic Console'
    );
}

// Reset Entire system state
function resetEntireSystemState() {
    incidentStage = 0;
    emergencyOverride = false;
    sprinklerActive = false;
    
    sensors.temp.val = 24.5;
    sensors.smoke.val = 12.1;
    sensors.flame.val = 0.0;

    sensors.temp.peak = 24.5;
    sensors.smoke.peak = 12.1;
    sensors.flame.peak = 0.0;
    
    sensors.temp.min = 24.5;
    sensors.smoke.min = 12.1;
    sensors.flame.min = 0.0;

    // Reset thresholds and elements
    thresholds.temp = 60.0;
    thresholds.smoke = 40.0;
    thresholds.flame = 1.50;

    const tempSl = document.getElementById('threshold-temp-range');
    const smokeSl = document.getElementById('threshold-smoke-range');
    const flameSl = document.getElementById('threshold-flame-range');

    if (tempSl) tempSl.value = 60;
    if (smokeSl) smokeSl.value = 40;
    if (flameSl) flameSl.value = 150;
    updateThresholdsFromSliders();

    const overrideBtn = document.getElementById('emergency-override-btn');
    if (overrideBtn) {
        overrideBtn.classList.remove('active');
        overrideBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg> Emergency Override`;
    }

    evaluateSafetyThresholds();
    updateInterfaceReadouts();

    addResponseActionLog('SYSTEM-RESET', 'Diagnostic states cleared. System returned to default calibration.');
    createTimelineAlert('SYSTEM RESET', 'Telemetry baselines and control systems calibrated.', 'info', 'Server core');
}

// Simulated Firebase/API fetching of latest fire alert status
let latestAlertLoaded = false;

function fetchLatestAlertData() {
    latestAlertLoaded = false;
    renderLatestAlertSkeleton();
    
    // Simulate async API call from Firebase / API
    setTimeout(() => {
        latestAlertLoaded = true;
        updateLatestAlertCard();
    }, 1200);
}

function renderLatestAlertSkeleton() {
    const container = document.getElementById('latest-alert-container');
    if (!container) return;
    
    container.innerHTML = `
        <div class="skeleton-loader">
            <p style="font-size:0.8rem; color:var(--text-muted); margin-bottom: 0.2rem;">Fetching latest alert...</p>
            <div class="skeleton-line skeleton-title"></div>
            <div class="skeleton-line skeleton-value" style="height: 40px;"></div>
            <div class="skeleton-line" style="width: 90%;"></div>
            <div class="skeleton-line" style="width: 75%;"></div>
        </div>
    `;
}

function updateLatestAlertCard() {
    const container = document.getElementById('latest-alert-container');
    const card = document.getElementById('latest-fire-alert-card');
    if (!container || !card) return;

    let statusText = 'Safe';
    let statusClass = 'status-safe';
    let cardClass = 'card-safe';

    if (systemState === 'CRITICAL') {
        statusText = 'Fire Detected';
        statusClass = 'status-critical';
        cardClass = 'card-critical';
    } else if (systemState === 'WARNING') {
        statusText = 'Warning';
        statusClass = 'status-warning';
        cardClass = 'card-warning';
    }

    // Set card class
    card.className = `glass-panel ${cardClass}`;

    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

    container.innerHTML = `
        <div class="alert-content-wrapper">
            <div class="alert-status-header">
                <span class="latest-alert-badge ${statusClass}">${statusText}</span>
                <span class="latest-alert-time">${timestamp}</span>
            </div>
            <div class="latest-alert-readings">
                <div class="reading-row">
                    <span class="reading-label">🌡️ Temperature:</span>
                    <span class="reading-value">${sensors.temp.val.toFixed(1)} °C</span>
                </div>
                <div class="reading-row">
                    <span class="reading-label">💨 Smoke Level:</span>
                    <span class="reading-value">${sensors.smoke.val.toFixed(1)} %</span>
                </div>
                <div class="reading-row">
                    <span class="reading-label">🔥 Flame Sensor:</span>
                    <span class="reading-value">${sensors.flame.val.toFixed(2)} W/m²</span>
                </div>
            </div>
            <div class="latest-alert-footer">
                <span>Last Updated: Just Now</span>
            </div>
        </div>
    `;
}

// Timeline Alert management
function createTimelineAlert(title, message, severity, location) {
    const timestamp = new Date().toLocaleTimeString([], { hour12: false });
    const datestamp = new Date().toLocaleDateString();

    const alert = {
        title,
        message,
        severity, // 'high', 'medium', 'low', 'info'
        location,
        timestamp,
        datestamp
    };

    activeAlerts.unshift(alert); // newest first

    renderTimelineFeed();
    renderAlertsPreview();
}

function renderTimelineFeed(filterType = 'all') {
    const container = document.getElementById('alert-timeline-feed');
    const noAlerts = document.getElementById('no-alerts-screen');
    
    // Clear dynamic cards
    const dynamicCards = container.querySelectorAll('.alert-card-large');
    dynamicCards.forEach(c => c.remove());

    const filtered = activeAlerts.filter(alert => {
        if (filterType === 'all') return true;
        return alert.severity === filterType;
    });

    if (filtered.length === 0) {
        noAlerts.style.display = 'flex';
        return;
    }

    noAlerts.style.display = 'none';

    filtered.forEach(alert => {
        const card = document.createElement('div');
        card.className = `glass-panel alert-card-large severity-${alert.severity}`;
        
        card.innerHTML = `
            <div class="side-bar"></div>
            <div class="alert-meta">
                <span class="alert-time-large">${alert.timestamp}</span>
                <span class="alert-date-large">${alert.datestamp}</span>
            </div>
            <div class="alert-info">
                <span class="alert-title-large" style="color: ${getSeverityColor(alert.severity)}">${alert.title}</span>
                <span class="alert-loc-large">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                    ${alert.location}
                </span>
                <span class="alert-desc-large">${alert.message}</span>
            </div>
            <div class="alert-actions">
                <button class="btn-panel-action" onclick="acknowledgeAlert(this)">Acknowledge</button>
            </div>
        `;
        container.appendChild(card);
    });
}

function renderAlertsPreview() {
    const container = document.getElementById('alerts-preview-feed');
    container.innerHTML = '';

    const warnings = activeAlerts.slice(0, 1); // latest alert only
    if (warnings.length === 0) {
        container.innerHTML = '<div class="empty-preview-state">No alerts recorded in the current session.</div>';
        return;
    }

    warnings.forEach(alert => {
        const div = document.createElement('div');
        div.className = `alert-item-mini severity-${alert.severity}`;
        div.innerHTML = `
            <div class="alert-mini-header">
                <span class="alert-badge severity-${alert.severity}">${alert.severity}</span>
                <span class="alert-mini-time">${alert.timestamp}</span>
            </div>
            <span class="alert-mini-msg">${alert.title}</span>
            <span class="alert-mini-loc">${alert.location}</span>
        `;
        container.appendChild(div);
    });
}

function getSeverityColor(sev) {
    if (sev === 'high') return 'var(--color-critical)';
    if (sev === 'medium') return 'var(--color-warn)';
    if (sev === 'low') return 'var(--color-safe)';
    return 'var(--color-accent)';
}

function filterTimeline(severity) {
    document.querySelectorAll('.timeline-filters .btn-pill').forEach(btn => {
        btn.classList.remove('active');
        if (btn.textContent.toLowerCase() === severity || (severity === 'all' && btn.textContent === 'All')) {
            btn.classList.add('active');
        }
    });

    renderTimelineFeed(severity);
}

// Acknowledge alert click
function acknowledgeAlert(btn) {
    const card = btn.closest('.alert-card-large');
    card.style.opacity = '0.5';
    btn.textContent = 'Acknowledged';
    btn.disabled = true;
    addResponseActionLog('ACKNOWLEDGE', 'Operator acknowledged alert signal.');
}


// Event logs (Right side alerts page)
function addResponseActionLog(type, details) {
    const time = new Date().toLocaleTimeString([], { hour12: false });
    const logBox = document.getElementById('response-event-logs');
    
    // Clear initial state helper
    if (logBox.innerHTML.includes('Waiting for automated')) {
        logBox.innerHTML = '';
    }

    const item = document.createElement('div');
    item.className = 'event-log-item';
    item.innerHTML = `
        <div class="event-log-header">
            <span style="color:var(--color-accent)">[${type}]</span>
            <span>${time}</span>
        </div>
        <div>${details}</div>
    `;

    logBox.insertBefore(item, logBox.firstChild); // newest on top
}


// Fire Incident History Database Manager (LocalStorage/Firebase-backed)
function seedIncidentsHistory() {
    let incidents = firebaseDb.ref('fire_incidents').get();
    if (incidents.length === 0) {
        incidents = [
            {
                date: '05 July 2026',
                fireTime: '10:42 AM',
                alertTime: '10:42:08 AM',
                sensors: { flame: true, smoke: true, temp: true },
                status: 'Alert Sent Successfully'
            },
            {
                date: '01 July 2026',
                fireTime: '11:04 AM',
                alertTime: '11:04:15 AM',
                sensors: { flame: false, smoke: true, temp: true },
                status: 'Alert Sent Successfully'
            }
        ];
        firebaseDb.ref('fire_incidents').set(incidents);
    }
}

function recordFireIncident() {
    const now = new Date();
    
    // Format Date: 05 July 2026
    const fireDate = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
    
    // Format Fire Time: 10:42 AM
    const fireTime = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    
    // Format Alert Time: 10:42:08 AM
    const alertTime = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });

    // Determine active sensors: check which ones are above/equal to thresholds
    const tempActive = sensors.temp.val >= thresholds.temp || sensors.temp.status === 'CRITICAL' || sensors.temp.status === 'WARNING';
    const smokeActive = sensors.smoke.val >= thresholds.smoke || sensors.smoke.status === 'CRITICAL' || sensors.smoke.status === 'WARNING';
    const flameActive = sensors.flame.val >= thresholds.flame || sensors.flame.status === 'CRITICAL' || sensors.flame.status === 'WARNING';

    // Fallback if none are active (e.g. manual override or diagnostic test drill)
    let isTempActive = tempActive;
    let isSmokeActive = smokeActive;
    let isFlameActive = flameActive;
    if (!isTempActive && !isSmokeActive && !isFlameActive) {
        isTempActive = true;
        isSmokeActive = true;
        isFlameActive = true;
    }

    const incident = {
        date: fireDate,
        fireTime: fireTime,
        alertTime: alertTime,
        sensors: {
            flame: isFlameActive,
            smoke: isSmokeActive,
            temp: isTempActive
        },
        status: 'Alert Sent Successfully'
    };

    // Store in LocalStorage (simulated Firebase)
    firebaseDb.ref('fire_incidents').push(incident);

    // Re-render History view
    renderIncidentsHistory();
}

function renderIncidentsHistory() {
    const container = document.getElementById('incident-history-list');
    if (!container) return;

    container.innerHTML = '';

    const incidents = firebaseDb.ref('fire_incidents').get();

    if (incidents.length === 0) {
        container.innerHTML = `
            <div class="glass-panel" style="grid-column: 1 / -1; text-align: center; padding: 3rem; color: var(--text-muted); font-style: italic;">
                No fire incidents recorded in the safety logs.
            </div>
        `;
        return;
    }

    incidents.forEach((incident, index) => {
        // Calculate original incident number (latest incident has the highest number)
        const incidentNumber = incidents.length - index;
        const card = document.createElement('div');
        card.className = 'glass-panel incident-card';
        
        card.innerHTML = `
            <div class="incident-header">
                🔥 Fire Incident #${incidentNumber}
            </div>
            <div class="incident-details">
                <div class="detail-row">
                    <span>📅</span>
                    <span class="detail-label">Date:</span>
                    <span class="detail-value">${incident.date}</span>
                </div>
                <div class="detail-row">
                    <span>🕒</span>
                    <span class="detail-label">Fire Time:</span>
                    <span class="detail-value">${incident.fireTime}</span>
                </div>
                <div class="detail-row">
                    <span>🚨</span>
                    <span class="detail-label">Alert Time:</span>
                    <span class="detail-value">${incident.alertTime}</span>
                </div>
                
                <div class="incident-sensors-section">
                    <div class="section-title">Sensors Active:</div>
                    <div class="sensor-list">
                        <div class="sensor-item">
                            <span>${incident.sensors.flame ? '✅' : '❌'}</span>
                            <span>Flame Sensor</span>
                        </div>
                        <div class="sensor-item">
                            <span>${incident.sensors.smoke ? '✅' : '❌'}</span>
                            <span>Smoke Sensor</span>
                        </div>
                        <div class="sensor-item">
                            <span>${incident.sensors.temp ? '✅' : '❌'}</span>
                            <span>Temperature Sensor</span>
                        </div>
                    </div>
                </div>
                
                <div class="incident-status-section">
                    <div class="section-title">Status:</div>
                    <div class="incident-status">
                        <span>✔</span> ${incident.status}
                    </div>
                </div>
            </div>
        `;
        container.appendChild(card);
    });
}


// Setup Charts
function initCharts() {
    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        animation: false, // Live high-frequency updates
        plugins: {
            legend: {
                labels: {
                    color: '#9ca3af',
                    font: { family: 'Outfit', size: 11 }
                }
            }
        },
        scales: {
            x: {
                grid: { color: 'rgba(255, 255, 255, 0.03)' },
                ticks: { color: '#6b7280', font: { family: 'JetBrains Mono', size: 9 } }
            },
            y: {
                grid: { color: 'rgba(255, 255, 255, 0.03)' },
                ticks: { color: '#6b7280', font: { family: 'JetBrains Mono', size: 9 } }
            }
        }
    };

    // 1. Dashboard MultiSensor Chart
    const ctxMain = document.getElementById('multiSensorChart').getContext('2d');
    mainChart = new Chart(ctxMain, {
        type: 'line',
        data: {
            labels: chartLabels,
            datasets: [
                {
                    label: 'Temperature (°C)',
                    data: chartTempData,
                    borderColor: '#ef4444',
                    borderWidth: 2,
                    pointRadius: 0,
                    tension: 0.1,
                    yAxisID: 'y'
                },
                {
                    label: 'Smoke Density (%)',
                    data: chartSmokeData,
                    borderColor: '#9ca3af',
                    borderWidth: 2,
                    pointRadius: 0,
                    tension: 0.1,
                    yAxisID: 'y1'
                },
                {
                    label: 'Flame (IR W/m²)',
                    data: chartFlameData,
                    borderColor: '#f59e0b',
                    borderWidth: 2,
                    pointRadius: 0,
                    tension: 0.1,
                    yAxisID: 'y2'
                }
            ]
        },
        options: {
            ...chartOptions,
            scales: {
                x: chartOptions.scales.x,
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    grid: { color: 'rgba(255, 255, 255, 0.03)' },
                    ticks: { color: '#ef4444', font: { family: 'JetBrains Mono', size: 9 } },
                    title: { display: true, text: 'Temp (°C)', color: '#ef4444', font: { family: 'Outfit', size: 10 } }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    grid: { drawOnChartArea: false },
                    ticks: { color: '#9ca3af', font: { family: 'JetBrains Mono', size: 9 } },
                    title: { display: true, text: 'Smoke (%)', color: '#9ca3af', font: { family: 'Outfit', size: 10 } }
                },
                y2: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    grid: { drawOnChartArea: false },
                    ticks: { color: '#f59e0b', font: { family: 'JetBrains Mono', size: 9 } },
                    title: { display: true, text: 'Flame (W/m²)', color: '#f59e0b', font: { family: 'Outfit', size: 10 } }
                }
            }
        }
    });

    // 2. Individual Detail Sensor Charts
    const detailOptions = (color, labelText) => ({
        ...chartOptions,
        plugins: { legend: { display: false } },
        scales: {
            x: chartOptions.scales.x,
            y: {
                grid: { color: 'rgba(255, 255, 255, 0.03)' },
                ticks: { color, font: { family: 'JetBrains Mono', size: 9 } },
                title: { display: true, text: labelText, color, font: { family: 'Outfit', size: 10 } }
            }
        }
    });

    const ctxTemp = document.getElementById('tempDetailChart').getContext('2d');
    tempChart = new Chart(ctxTemp, {
        type: 'line',
        data: {
            labels: chartLabels,
            datasets: [{ data: chartTempData, borderColor: '#ef4444', borderWidth: 2, pointRadius: 1, tension: 0.1, fill: 'origin', backgroundColor: 'rgba(239, 68, 68, 0.03)' }]
        },
        options: detailOptions('#ef4444', 'Temperature (°C)')
    });

    const ctxSmoke = document.getElementById('smokeDetailChart').getContext('2d');
    smokeChart = new Chart(ctxSmoke, {
        type: 'line',
        data: {
            labels: chartLabels,
            datasets: [{ data: chartSmokeData, borderColor: '#9ca3af', borderWidth: 2, pointRadius: 1, tension: 0.1, fill: 'origin', backgroundColor: 'rgba(156, 163, 175, 0.03)' }]
        },
        options: detailOptions('#9ca3af', 'Smoke Density (%)')
    });

    const ctxFlame = document.getElementById('flameDetailChart').getContext('2d');
    flameChart = new Chart(ctxFlame, {
        type: 'line',
        data: {
            labels: chartLabels,
            datasets: [{ data: chartFlameData, borderColor: '#f59e0b', borderWidth: 2, pointRadius: 1, tension: 0.1, fill: 'origin', backgroundColor: 'rgba(245, 158, 11, 0.03)' }]
        },
        options: detailOptions('#f59e0b', 'Flame Intensity (W/m²)')
    });
}