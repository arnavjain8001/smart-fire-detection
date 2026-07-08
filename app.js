    // app.js - Smart Fire Detection Dashboard Controller

// System State Variables
let systemState = 'SAFE'; // 'SAFE', 'WARNING', 'CRITICAL'
let currentTab = 'dashboard';



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
    smoke: 1638, // Adjusted for raw ADC value (previously 40.0%)
    flame: 1.50
};

// System Controls
let autoMode = true;
let sprinklerActive = false;
let emergencyOverride = false;

// Firebase Configuration & Initialization
const firebaseConfig = {
    apiKey: ENV.FIREBASE_API_KEY,
    authDomain: ENV.FIREBASE_AUTH_DOMAIN,
    databaseURL: ENV.FIREBASE_DATABASE_URL,
    projectId: ENV.FIREBASE_PROJECT_ID,
    storageBucket: ENV.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: ENV.FIREBASE_MESSAGING_SENDER_ID,
    appId: ENV.FIREBASE_APP_ID,
    measurementId: ENV.FIREBASE_MEASUREMENT_ID
};

firebase.initializeApp(firebaseConfig);
const database = firebase.database();
let firebaseConnected = false;

// Local incident history storage (localStorage-backed)
const incidentStore = {
    push: function(data) {
        let list = JSON.parse(localStorage.getItem('fire_incidents') || '[]');
        list.unshift(data);
        localStorage.setItem('fire_incidents', JSON.stringify(list));
    },
    get: function() {
        return JSON.parse(localStorage.getItem('fire_incidents') || '[]');
    },
    set: function(data) {
        localStorage.setItem('fire_incidents', JSON.stringify(data));
    }
};

let activeAlerts = [];

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
    
    // Start Firebase real-time listener for sensor data
    startFirebaseListener();

    // Start UI refresh loop (pushes chart data & refreshes readouts every second)
    setInterval(uiRefreshLoop, 1000);

    // Load initial history view
    renderIncidentsHistory();

    // Fetch latest fire alert info
    fetchLatestAlertData();
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

// Firebase Real-time Listener — fetches live sensor data from RTDB
function startFirebaseListener() {
    const sensorRef = database.ref('sensorData');

    // Monitor connection state
    database.ref('.info/connected').on('value', (snap) => {
        const espBadge = document.getElementById('health-esp32-badge');
        const wifiBadge = document.getElementById('health-wifi-badge');

        if (snap.val() === true) {
            firebaseConnected = true;
            if (espBadge) { espBadge.textContent = '● Connected'; espBadge.className = 'dev-badge dev-active'; }
            if (wifiBadge) { wifiBadge.textContent = '● Connected'; wifiBadge.className = 'dev-badge dev-active'; }
            addResponseActionLog('FIREBASE', 'Real-time database connection established.');
        } else {
            firebaseConnected = false;
            if (espBadge) { espBadge.textContent = '● Disconnected'; espBadge.className = 'dev-badge dev-offline'; }
            if (wifiBadge) { wifiBadge.textContent = '● Disconnected'; wifiBadge.className = 'dev-badge dev-offline'; }
        }
    });

    // Listen for real-time sensor data updates
    sensorRef.on('value', (snapshot) => {
        const data = snapshot.val();
        if (!data) return;

        // Map Firebase fields to dashboard sensors
        // temperature → Temperature sensor (°C)
        if (data.temperature !== undefined) {
            sensors.temp.val = parseFloat(data.temperature);
            sensors.temp.active = true;
        }

        // gasValue → Smoke/Gas sensor (raw value from database)
        if (data.gasValue !== undefined) {
            sensors.smoke.val = parseFloat(data.gasValue);
            sensors.smoke.active = true;
        }

        // flameState → Flame sensor (digital: 1 = no flame, 0 = flame detected)
        if (data.flameState !== undefined) {
            const flameDetected = (parseInt(data.flameState) === 0);
            sensors.flame.val = flameDetected ? thresholds.flame : 0.0;
            sensors.flame.active = true;
        }

        // Update session peak/min envelopes
        sensors.temp.peak = Math.max(sensors.temp.peak, sensors.temp.val);
        sensors.temp.min = Math.min(sensors.temp.min, sensors.temp.val);
        sensors.smoke.peak = Math.max(sensors.smoke.peak, sensors.smoke.val);
        sensors.smoke.min = Math.min(sensors.smoke.min, sensors.smoke.val);
        sensors.flame.peak = Math.max(sensors.flame.peak, sensors.flame.val);
        sensors.flame.min = Math.min(sensors.flame.min, sensors.flame.val);

        // Update device health badges based on Firebase alert flags
        updateDeviceHealthFromFirebase(data);

        // Evaluate safety thresholds with new data
        evaluateSafetyThresholds();

        // Immediately update UI with fresh data
        updateInterfaceReadouts();
    });
}

// Update device health badges from Firebase alert flags
function updateDeviceHealthFromFirebase(data) {
    const tempBadge = document.getElementById('health-temp-badge');
    const smokeBadge = document.getElementById('health-smoke-badge');
    const flameBadge = document.getElementById('health-flame-badge');
    const pumpBadge = document.getElementById('health-pump-badge');

    // Temperature sensor status
    if (tempBadge) {
        tempBadge.textContent = '● Active';
        tempBadge.className = 'dev-badge dev-active';
    }
    document.getElementById('detail-temp-conn').textContent = '● ACTIVE';
    document.getElementById('detail-temp-conn').style.color = 'var(--color-safe)';

    // Smoke/Gas sensor status
    if (smokeBadge) {
        smokeBadge.textContent = '● Active';
        smokeBadge.className = 'dev-badge dev-active';
    }
    document.getElementById('detail-smoke-conn').textContent = '● ACTIVE';
    document.getElementById('detail-smoke-conn').style.color = 'var(--color-safe)';

    // Flame sensor status
    if (flameBadge) {
        flameBadge.textContent = '● Active';
        flameBadge.className = 'dev-badge dev-active';
    }
    document.getElementById('detail-flame-conn').textContent = '● ACTIVE';
    document.getElementById('detail-flame-conn').style.color = 'var(--color-safe)';

    // Buzzer / Pump status from Firebase
    if (pumpBadge) {
        if (data.buzzer === true) {
            pumpBadge.textContent = '● ACTIVE';
            pumpBadge.className = 'dev-badge dev-offline'; // red = active alert
        } else {
            pumpBadge.textContent = '● Ready';
            pumpBadge.className = 'dev-badge dev-active';
        }
    }
}

// UI Refresh Loop — pushes chart data at regular intervals
function uiRefreshLoop() {
    pushChartData();
    updateInterfaceReadouts();
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
    let incidents = incidentStore.get();
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
        incidentStore.set(incidents);
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

    // Store in LocalStorage
    incidentStore.push(incident);

    // Re-render History view
    renderIncidentsHistory();
}

function renderIncidentsHistory() {
    const container = document.getElementById('incident-history-list');
    if (!container) return;

    container.innerHTML = '';

    const incidents = incidentStore.get();

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
                    color: '#4B5563',
                    font: { family: 'Outfit', size: 11 }
                }
            }
        },
        scales: {
            x: {
                grid: { color: 'rgba(0, 0, 0, 0.05)' },
                ticks: { color: '#6B7280', font: { family: 'JetBrains Mono', size: 9 } }
            },
            y: {
                grid: { color: 'rgba(0, 0, 0, 0.05)' },
                ticks: { color: '#6B7280', font: { family: 'JetBrains Mono', size: 9 } }
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
                    borderColor: '#F97316',
                    borderWidth: 2,
                    pointRadius: 0,
                    tension: 0.1,
                    yAxisID: 'y'
                },
                {
                    label: 'Smoke Density (%)',
                    data: chartSmokeData,
                    borderColor: '#A855F7',
                    borderWidth: 2,
                    pointRadius: 0,
                    tension: 0.1,
                    yAxisID: 'y1'
                },
                {
                    label: 'Flame (IR W/m²)',
                    data: chartFlameData,
                    borderColor: '#06B6D4',
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
                    grid: { color: 'rgba(0, 0, 0, 0.05)' },
                    ticks: { color: '#F97316', font: { family: 'JetBrains Mono', size: 9 } },
                    title: { display: true, text: 'Temp (°C)', color: '#F97316', font: { family: 'Outfit', size: 10 } }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    grid: { drawOnChartArea: false },
                    ticks: { color: '#A855F7', font: { family: 'JetBrains Mono', size: 9 } },
                    title: { display: true, text: 'Smoke (%)', color: '#A855F7', font: { family: 'Outfit', size: 10 } }
                },
                y2: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    grid: { drawOnChartArea: false },
                    ticks: { color: '#06B6D4', font: { family: 'JetBrains Mono', size: 9 } },
                    title: { display: true, text: 'Flame (W/m²)', color: '#06B6D4', font: { family: 'Outfit', size: 10 } }
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
                grid: { color: 'rgba(0, 0, 0, 0.05)' },
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
            datasets: [{ data: chartTempData, borderColor: '#F97316', borderWidth: 2, pointRadius: 1, tension: 0.1, fill: 'origin', backgroundColor: 'rgba(249, 115, 22, 0.05)' }]
        },
        options: detailOptions('#F97316', 'Temperature (°C)')
    });

    const ctxSmoke = document.getElementById('smokeDetailChart').getContext('2d');
    smokeChart = new Chart(ctxSmoke, {
        type: 'line',
        data: {
            labels: chartLabels,
            datasets: [{ data: chartSmokeData, borderColor: '#A855F7', borderWidth: 2, pointRadius: 1, tension: 0.1, fill: 'origin', backgroundColor: 'rgba(168, 85, 247, 0.05)' }]
        },
        options: detailOptions('#A855F7', 'Smoke Density (%)')
    });

    const ctxFlame = document.getElementById('flameDetailChart').getContext('2d');
    flameChart = new Chart(ctxFlame, {
        type: 'line',
        data: {
            labels: chartLabels,
            datasets: [{ data: chartFlameData, borderColor: '#06B6D4', borderWidth: 2, pointRadius: 1, tension: 0.1, fill: 'origin', backgroundColor: 'rgba(6, 182, 212, 0.05)' }]
        },
        options: detailOptions('#06B6D4', 'Flame Intensity (W/m²)')
    });
}