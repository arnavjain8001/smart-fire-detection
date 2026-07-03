// app.js - Smart Fire Detection Dashboard Controller

// System State Variables
let systemState = 'SAFE'; // 'SAFE', 'WARNING', 'CRITICAL'
let currentTab = 'dashboard';

// Sensor values
let sensors = {
    temp: { val: 24.5, peak: 24.5, min: 24.5, status: 'SAFE', key: 'temperature' },
    smoke: { val: 12.1, peak: 12.1, min: 12.1, status: 'SAFE', key: 'smoke' },
    flame: { val: 0.0, peak: 0.0, min: 0.0, status: 'SAFE', key: 'flame' }
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

// History logs & alerts databases
let historyLogs = [];
let activeAlerts = [];
let simulatedIncidentTimer = null;
let incidentStage = 0; // 0=None, 1=Building Up, 2=Critical peak, 3=Cooldown

// Chart.js instances
let mainChart = null;
let tempChart = null;
let smokeChart = null;
let flameChart = null;

// History Pagination State
let historyPage = 1;
const historyPageSize = 10;
let filteredLogs = [];

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
    seedHistoryLogs();

    // Initialize Charts
    initCharts();
    
    // Start real-time sensor loop (runs every second)
    setInterval(sensorTelemetryLoop, 1000);

    // Initialize control inputs with JS state
    document.getElementById('sprinkler-toggle').checked = sprinklerActive;
    document.getElementById('auto-mode-toggle').checked = autoMode;

    // Load initial history table
    applyHistoryFilters();
});

// Update Clock
function updateClock() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    document.getElementById('realtime-clock').textContent = timeStr;
}

// Switch between dashboard pages/tabs
function switchTab(tabId) {
    // Remove active state from all buttons
    document.querySelectorAll('.nav-tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Find clicked tab button and make active
    const activeBtn = Array.from(document.querySelectorAll('.nav-tab-btn')).find(btn => 
        btn.textContent.toLowerCase().includes(tabId)
    );
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

// Generate realistic fluctuating environmental variables
function sensorTelemetryLoop() {
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
        addHistoryLog(datestamp, timestamp, 'CRITICAL', 'Multi-Sensor Array', `${sensors.temp.val.toFixed(1)}°C / ${sensors.smoke.val.toFixed(1)}%`, 'HAZARD ESCALATION SHIFT');
        addResponseActionLog('ALARM', 'Siren Array Activated - Building Evacuation Command Sent.');
    } 
    else if (toState === 'WARNING') {
        title = 'SAFETY ENVELOPE WARNING';
        msg = `Sensors approaching limits. Inspect Area.`;
        addHistoryLog(datestamp, timestamp, 'WARNING', 'Multi-Sensor Array', `Envelopes exceeded 75%`, 'INTEGRITY WARNING TRIGGERED');
    } 
    else if (toState === 'SAFE' && fromState === 'CRITICAL') {
        title = 'THREAT DISARMED';
        msg = `All safety checks returned normal. Threat neutralized.`;
        addHistoryLog(datestamp, timestamp, 'SAFE', 'System Controls', `Restored to safe range`, 'THREAT NEUTRALIZED');
        
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
    const statusDot = document.getElementById('system-status-dot');
    const statusText = document.getElementById('system-status-text');
    const overlay = document.getElementById('critical-overlay');

    statusDot.className = 'status-dot';
    overlay.style.display = 'none';

    if (systemState === 'CRITICAL') {
        statusDot.classList.add('critical');
        statusText.textContent = 'CRITICAL ALARM';
        statusText.style.color = 'var(--color-critical)';
        overlay.style.display = 'block'; // Turn flashing screen on
    } else if (systemState === 'WARNING') {
        statusDot.classList.add('warning');
        statusText.textContent = 'WARNING ACTIVE';
        statusText.style.color = 'var(--color-warn)';
    } else {
        statusText.textContent = 'ONLINE (NOMINAL)';
        statusText.style.color = 'var(--color-safe)';
    }

    // 2. Dashboard status card updates
    const dashCard = document.getElementById('dashboard-status-card');
    const dashVal = document.getElementById('dashboard-status-val');
    const dashDesc = document.getElementById('dashboard-status-desc');

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

    // 5. Update Sprinkler status visual card
    const sprinklerCard = document.getElementById('sprinkler-status-card');
    const sprinklerTitle = document.getElementById('sprinkler-status-title');
    const sprinklerLbl = document.getElementById('sprinkler-status-lbl');
    
    sprinklerCard.className = 'glass-panel sprinkler-card';
    if (sprinklerActive) {
        sprinklerCard.classList.add('active');
        if (systemState === 'CRITICAL') sprinklerCard.classList.add('alert-danger');
        sprinklerTitle.textContent = 'Sprinkler Actuator Deploying';
        sprinklerLbl.textContent = 'DISCHARGING WATER';
    } else {
        sprinklerTitle.textContent = 'Sprinkler Actuator Standby';
        sprinklerLbl.textContent = 'DEACTIVATED';
    }

    // 6. Sync UI Checkbox indicators
    document.getElementById('sprinkler-toggle').checked = sprinklerActive;
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
    const detMin = document.getElementById(`detail-${id}-min`);
    const detThresh = document.getElementById(`detail-${id}-threshold`);

    if (detVal) {
        detVal.textContent = data.val.toFixed(id === 'flame' ? 2 : 1);
        detPeak.textContent = `${data.peak.toFixed(id === 'flame' ? 2 : 1)}${unit}`;
        detMin.textContent = `${data.min.toFixed(id === 'flame' ? 2 : 1)}${unit}`;
        detThresh.textContent = `${thresholds[id].toFixed(id === 'flame' ? 2 : 1)}${unit}`;

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
    
    const timestamp = new Date().toLocaleTimeString([], { hour12: false });
    const datestamp = new Date().toLocaleDateString();
    addHistoryLog(datestamp, timestamp, 'SAFE', 'System Controls', `Mode: ${action}`, 'Auto Automation Adjusted');
}

// Execute actuator state shifts
function activateSprinkler(active, source = 'MANUAL-OVERRIDE') {
    sprinklerActive = active;
    
    const timestamp = new Date().toLocaleTimeString([], { hour12: false });
    const datestamp = new Date().toLocaleDateString();

    const actionText = active ? 'WATER DISCHARGE INITIATED' : 'DISCHARGE TERMINATED';
    const logSeverity = active ? (systemState === 'CRITICAL' ? 'CRITICAL' : 'WARNING') : 'SAFE';

    // Log the change
    addHistoryLog(datestamp, timestamp, logSeverity, 'Sprinkler Core Actuator', active ? 'OPEN' : 'CLOSED', actionText);
    
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

    if (emergencyOverride) {
        btn.classList.add('active');
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg> Cancel Override`;
        evaluateSafetyThresholds(); // trigger system level warnings
    } else {
        btn.classList.remove('active');
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg> Emergency Override`;
        evaluateSafetyThresholds();
    }
}

// Settings Threshold Sliders Event Handler
function updateThresholdsFromSliders() {
    const tempSl = document.getElementById('threshold-temp-range');
    const smokeSl = document.getElementById('threshold-smoke-range');
    const flameSl = document.getElementById('threshold-flame-range');

    thresholds.temp = parseFloat(tempSl.value);
    thresholds.smoke = parseFloat(smokeSl.value);
    thresholds.flame = parseFloat(flameSl.value) / 100.0; // scale down slider 20-500 -> 0.2 - 5.0

    // Readout indicators
    document.getElementById('lbl-temp-threshold').textContent = thresholds.temp;
    document.getElementById('lbl-smoke-threshold').textContent = thresholds.smoke;
    document.getElementById('lbl-flame-threshold').textContent = thresholds.flame.toFixed(2);

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

    // Reset sliders
    document.getElementById('threshold-temp-range').value = 60;
    document.getElementById('threshold-smoke-range').value = 40;
    document.getElementById('threshold-flame-range').value = 150;
    updateThresholdsFromSliders();

    const overrideBtn = document.getElementById('emergency-override-btn');
    overrideBtn.classList.remove('active');
    overrideBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg> Emergency Override`;

    evaluateSafetyThresholds();
    updateInterfaceReadouts();

    addResponseActionLog('SYSTEM-RESET', 'Diagnostic states cleared. System returned to default calibration.');
    createTimelineAlert('SYSTEM RESET', 'Telemetry baselines and control systems calibrated.', 'info', 'Server core');
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

    const warnings = activeAlerts.slice(0, 3); // last 3 logs
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
    // Toggle active state in filters
    document.querySelectorAll('.timeline-filters .btn-pill').forEach(btn => {
        btn.classList.remove('active');
        if (btn.textContent.toLowerCase() === severity || (severity === 'all' && btn.textContent === 'All')) {
            btn.classList.add('active');
        }
    });

    renderTimelineFeed(severity);
}

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


// History Database Manager
function addHistoryLog(date, time, severity, sensor, value, action) {
    historyLogs.unshift({
        date,
        time,
        severity, // 'SAFE', 'WARNING', 'CRITICAL'
        sensor,
        value,
        action
    });
    
    applyHistoryFilters();
}

function seedHistoryLogs() {
    const today = new Date().toLocaleDateString();
    
    // Mock seed safety archives
    historyLogs = [
        { date: today, time: '10:14:22', severity: 'SAFE', sensor: 'System Controls', value: 'Baseline Boot', action: 'Diagnostics Nominal' },
        { date: today, time: '08:00:00', severity: 'SAFE', sensor: 'Calibration Core', value: 'Standard Sync', action: 'Threshold limits synced' },
        { date: '2026-07-01', time: '18:32:10', severity: 'WARNING', sensor: 'Thermal S-TEMP-001', value: '46.8 °C', action: 'Sector Warning Alert issued' },
        { date: '2026-07-01', time: '15:20:00', severity: 'SAFE', sensor: 'Maintenance', value: 'Manual Test', action: 'Sprinkler deployment check ok' },
        { date: '2026-07-01', time: '11:05:43', severity: 'CRITICAL', sensor: 'Flame S-FLAM-003', value: '1.85 W/m²', action: 'Automatic water deployment' },
        { date: '2026-07-01', time: '11:05:42', severity: 'CRITICAL', sensor: 'Photoelectric S-SMOK-002', value: '42.1%', action: 'Sirens triggered building core' },
        { date: '2026-07-01', time: '11:04:15', severity: 'WARNING', sensor: 'Thermal S-TEMP-001', value: '45.2 °C', action: 'Thermal deviation alert' }
    ];
}

function renderHistoryTable() {
    const tbody = document.getElementById('history-table-body');
    tbody.innerHTML = '';

    const start = (historyPage - 1) * historyPageSize;
    const end = Math.min(start + historyPageSize, filteredLogs.length);
    const paginated = filteredLogs.slice(start, end);

    if (paginated.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); font-style:italic;">No log archives found matching current filter definitions.</td></tr>`;
        document.getElementById('history-pagination-info').textContent = 'Showing 0-0 of 0 logs';
        return;
    }

    paginated.forEach(log => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${log.date}</td>
            <td class="cell-mono">${log.time}</td>
            <td>
                <span class="alert-badge severity-${log.severity === 'CRITICAL' ? 'high' : (log.severity === 'WARNING' ? 'medium' : 'low')}">
                    ${log.severity}
                </span>
            </td>
            <td>${log.sensor}</td>
            <td class="cell-mono">${log.value}</td>
            <td>${log.action}</td>
        `;
        tbody.appendChild(tr);
    });

    document.getElementById('history-pagination-info').textContent = `Showing ${start + 1}-${end} of ${filteredLogs.length} logs`;

    // Disable buttons if bounds hit
    document.getElementById('history-prev-btn').disabled = (historyPage === 1);
    document.getElementById('history-next-btn').disabled = (end >= filteredLogs.length);
}

function applyHistoryFilters() {
    const severity = document.getElementById('history-severity-filter').value;
    const sensor = document.getElementById('history-sensor-filter').value;
    const dateVal = document.getElementById('history-date-filter').value;

    filteredLogs = historyLogs.filter(log => {
        // Severity Filter
        if (severity !== 'all' && log.severity !== severity) return false;
        
        // Sensor Filter
        if (sensor !== 'all') {
            if (sensor === 'Thermal' && !log.sensor.includes('Temp') && !log.sensor.includes('Thermal')) return false;
            if (sensor === 'Smoke' && !log.sensor.includes('Smoke') && !log.sensor.includes('Photoelectric')) return false;
            if (sensor === 'Flame' && !log.sensor.includes('Flame') && !log.sensor.includes('IR')) return false;
            if (sensor === 'Sprinkler' && !log.sensor.includes('Sprinkler')) return false;
        }

        // Date Filter
        if (dateVal) {
            let logDateFormatted = log.date;
            if (log.date === new Date().toLocaleDateString()) {
                const todayObj = new Date();
                const yyyy = todayObj.getFullYear();
                const mm = String(todayObj.getMonth() + 1).padStart(2, '0');
                const dd = String(todayObj.getDate()).padStart(2, '0');
                logDateFormatted = `${yyyy}-${mm}-${dd}`;
            }
            if (logDateFormatted !== dateVal) return false;
        }

        return true;
    });

    historyPage = 1; // return to first page on filter change
    renderHistoryTable();
}

function resetHistoryFilters() {
    document.getElementById('history-severity-filter').value = 'all';
    document.getElementById('history-sensor-filter').value = 'all';
    document.getElementById('history-date-filter').value = '';
    applyHistoryFilters();
}

function paginateHistory(dir) {
    historyPage += dir;
    renderHistoryTable();
}

function clearHistoryLogData() {
    historyLogs = [];
    applyHistoryFilters();
    addResponseActionLog('DB-CLEAR', 'Historic log databases cleared by administrator.');
}


// Setup Charts
function initCharts() {
    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        animation: false, // Live high-frequency values
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