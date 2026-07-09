import React, { useState, useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, onValue } from 'firebase/database';
import { ENV } from './config';
import { audioService } from './services/AudioService';
import { notificationService } from './services/NotificationService';
import EmergencyPopup from './components/EmergencyPopup';
import EmergencyBanner from './components/EmergencyBanner';

// Initialize Firebase
const firebaseApp = initializeApp({
  apiKey: ENV.FIREBASE_API_KEY,
  authDomain: ENV.FIREBASE_AUTH_DOMAIN,
  databaseURL: ENV.FIREBASE_DATABASE_URL,
  projectId: ENV.FIREBASE_PROJECT_ID,
  storageBucket: ENV.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: ENV.FIREBASE_MESSAGING_SENDER_ID,
  appId: ENV.FIREBASE_APP_ID,
  measurementId: ENV.FIREBASE_MEASUREMENT_ID
});

const database = getDatabase(firebaseApp);

export default function App() {
  // System states
  const [systemState, setSystemState] = useState('SAFE'); // SAFE, WARNING, CRITICAL
  const [currentTab, setCurrentTab] = useState('dashboard');
  
  // Firebase Live Alarm states
  const [firebaseFireStatus, setFirebaseFireStatus] = useState(false);
  const [firebaseFireSeverity, setFirebaseFireSeverity] = useState('CRITICAL');
  const [firebaseConnected, setFirebaseConnected] = useState(false);

  // Manual & Auto Controls
  const [autoMode, setAutoMode] = useState(true);
  const [sprinklerActive, setSprinklerActive] = useState(false);
  const [emergencyOverride, setEmergencyOverride] = useState(false);

  // Emergency Popup manual dismiss flag
  const [alertDismissed, setAlertDismissed] = useState(false);

  // Live telemetry values
  const [sensors, setSensors] = useState({
    temp: { val: 24.5, peak: 24.5, min: 24.5, status: 'SAFE', active: true },
    smoke: { val: 12.1, peak: 12.1, min: 12.1, status: 'SAFE', active: true },
    flame: { val: 0.0, peak: 0.0, min: 0.0, status: 'SAFE', active: true }
  });

  // Device status/connectivityhealth
  const [deviceHealth, setDeviceHealth] = useState({
    tempSensor: 'Active',
    smokeSensor: 'Active',
    flameSensor: 'Active',
    esp32: 'Connected',
    wifi: 'Connected',
    pump: 'Ready'
  });

  // Thresholds
  const thresholds = {
    temp: 60.0,
    smoke: 1638,
    flame: 1.50
  };

  // Logs & Incident Lists
  const [activeAlerts, setActiveAlerts] = useState([]);
  const [responseLogs, setResponseLogs] = useState([]);
  const [incidents, setIncidents] = useState([]);

  // Realtime Clock Time String
  const [timeStr, setTimeStr] = useState('');

  // Diagnostic tests
  const [incidentStage, setIncidentStage] = useState(0);

  // Canvas and Chart Refs
  const mainCanvasRef = useRef(null);
  const tempCanvasRef = useRef(null);
  const smokeCanvasRef = useRef(null);
  const flameCanvasRef = useRef(null);

  const mainChartRef = useRef(null);
  const tempChartRef = useRef(null);
  const smokeChartRef = useRef(null);
  const flameChartRef = useRef(null);

  // Data Buffers for charts
  const maxTicks = 20;
  const chartLabelsRef = useRef(Array(maxTicks).fill(''));
  const chartTempDataRef = useRef(Array(maxTicks).fill(24.5));
  const chartSmokeDataRef = useRef(Array(maxTicks).fill(12.1));
  const chartFlameDataRef = useRef(Array(maxTicks).fill(0.0));

  // Refs to prevent stale closures in intervals/listeners
  const sensorsRef = useRef(sensors);
  const currentTabRef = useRef(currentTab);
  const autoModeRef = useRef(autoMode);
  const sprinklerActiveRef = useRef(sprinklerActive);
  const emergencyOverrideRef = useRef(emergencyOverride);
  const deviceHealthRef = useRef(deviceHealth);
  const systemStateRef = useRef(systemState);
  const firebaseFireStatusRef = useRef(firebaseFireStatus);
  const firebaseFireSeverityRef = useRef(firebaseFireSeverity);
  const lastFireActiveRef = useRef(false);

  useEffect(() => { sensorsRef.current = sensors; }, [sensors]);
  useEffect(() => { currentTabRef.current = currentTab; }, [currentTab]);
  useEffect(() => { autoModeRef.current = autoMode; }, [autoMode]);
  useEffect(() => { sprinklerActiveRef.current = sprinklerActive; }, [sprinklerActive]);
  useEffect(() => { emergencyOverrideRef.current = emergencyOverride; }, [emergencyOverride]);
  useEffect(() => { deviceHealthRef.current = deviceHealth; }, [deviceHealth]);
  useEffect(() => { systemStateRef.current = systemState; }, [systemState]);
  useEffect(() => { firebaseFireStatusRef.current = firebaseFireStatus; }, [firebaseFireStatus]);
  useEffect(() => { firebaseFireSeverityRef.current = firebaseFireSeverity; }, [firebaseFireSeverity]);

  // Overall Emergency State computed
  const isFireActive = firebaseFireStatus || emergencyOverride || (systemState === 'CRITICAL');
  const activeSeverity = firebaseFireStatus ? firebaseFireSeverity : 'CRITICAL';

  // Seed incidents from local storage
  useEffect(() => {
    let list = JSON.parse(localStorage.getItem('fire_incidents') || '[]');
    if (list.length === 0) {
      list = [
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
      localStorage.setItem('fire_incidents', JSON.stringify(list));
    }
    setIncidents(list);
  }, []);

  // Clock tick
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setTimeStr(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }));
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);

  // Setup Charts on mount
  useEffect(() => {
    const chartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
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

    if (mainCanvasRef.current) {
      const ctxMain = mainCanvasRef.current.getContext('2d');
      mainChartRef.current = new Chart(ctxMain, {
        type: 'line',
        data: {
          labels: chartLabelsRef.current,
          datasets: [
            {
              label: 'Temperature (°C)',
              data: chartTempDataRef.current,
              borderColor: '#F97316',
              borderWidth: 2,
              pointRadius: 0,
              tension: 0.1,
              yAxisID: 'y'
            },
            {
              label: 'Smoke Density (%)',
              data: chartSmokeDataRef.current,
              borderColor: '#A855F7',
              borderWidth: 2,
              pointRadius: 0,
              tension: 0.1,
              yAxisID: 'y1'
            },
            {
              label: 'Flame (IR W/m²)',
              data: chartFlameDataRef.current,
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
    }

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

    if (tempCanvasRef.current) {
      const ctxTemp = tempCanvasRef.current.getContext('2d');
      tempChartRef.current = new Chart(ctxTemp, {
        type: 'line',
        data: {
          labels: chartLabelsRef.current,
          datasets: [{ data: chartTempDataRef.current, borderColor: '#F97316', borderWidth: 2, pointRadius: 1, tension: 0.1, fill: 'origin', backgroundColor: 'rgba(249, 115, 22, 0.05)' }]
        },
        options: detailOptions('#F97316', 'Temperature (°C)')
      });
    }

    if (smokeCanvasRef.current) {
      const ctxSmoke = smokeCanvasRef.current.getContext('2d');
      smokeChartRef.current = new Chart(ctxSmoke, {
        type: 'line',
        data: {
          labels: chartLabelsRef.current,
          datasets: [{ data: chartSmokeDataRef.current, borderColor: '#A855F7', borderWidth: 2, pointRadius: 1, tension: 0.1, fill: 'origin', backgroundColor: 'rgba(168, 85, 247, 0.05)' }]
        },
        options: detailOptions('#A855F7', 'Smoke Density (%)')
      });
    }

    if (flameCanvasRef.current) {
      const ctxFlame = flameCanvasRef.current.getContext('2d');
      flameChartRef.current = new Chart(ctxFlame, {
        type: 'line',
        data: {
          labels: chartLabelsRef.current,
          datasets: [{ data: chartFlameDataRef.current, borderColor: '#06B6D4', borderWidth: 2, pointRadius: 1, tension: 0.1, fill: 'origin', backgroundColor: 'rgba(6, 182, 212, 0.05)' }]
        },
        options: detailOptions('#06B6D4', 'Flame Intensity (W/m²)')
      });
    }

    return () => {
      if (mainChartRef.current) mainChartRef.current.destroy();
      if (tempChartRef.current) tempChartRef.current.destroy();
      if (smokeChartRef.current) smokeChartRef.current.destroy();
      if (flameChartRef.current) flameChartRef.current.destroy();
    };
  }, []);

  // UI Tick to push data to charts
  useEffect(() => {
    const uiTick = () => {
      const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
      
      chartLabelsRef.current.push(timestamp);
      chartLabelsRef.current.shift();

      chartTempDataRef.current.push(sensorsRef.current.temp.val);
      chartTempDataRef.current.shift();

      chartSmokeDataRef.current.push(sensorsRef.current.smoke.val);
      chartSmokeDataRef.current.shift();

      chartFlameDataRef.current.push(sensorsRef.current.flame.val);
      chartFlameDataRef.current.shift();

      if (mainChartRef.current && currentTabRef.current === 'dashboard') {
        mainChartRef.current.update('none');
      }

      if (currentTabRef.current === 'sensors') {
        if (tempChartRef.current) tempChartRef.current.update('none');
        if (smokeChartRef.current) smokeChartRef.current.update('none');
        if (flameChartRef.current) flameChartRef.current.update('none');
      }
    };

    const interval = setInterval(uiTick, 1000);
    return () => clearInterval(interval);
  }, []);

  // Firebase Real-time DB Listener
  useEffect(() => {
    const sensorDataRef = ref(database, 'sensorData');
    
    // Connected monitor
    const connectedRef = ref(database, '.info/connected');
    const unsubscribeConnected = onValue(connectedRef, (snap) => {
      const isConnected = snap.val() === true;
      setFirebaseConnected(isConnected);
      setDeviceHealth((prev) => {
        const next = { ...prev };
        if (isConnected) {
          next.esp32 = 'Connected';
          next.wifi = 'Connected';
          addResponseActionLog('FIREBASE', 'Real-time database connection established.');
        } else {
          next.esp32 = 'Disconnected';
          next.wifi = 'Disconnected';
        }
        return next;
      });
    });

    // Sensor updates monitor
    const unsubscribeSensors = onValue(sensorDataRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) return;

      // Extract Fire Status & Severity
      let fStatus = false;
      if (data.fireStatus !== undefined) {
        fStatus = (data.fireStatus === true || data.fireStatus === 'true' || data.fireStatus === 1 || data.fireStatus === '1' || data.fireStatus === 'TRUE');
      }
      
      const fSeverity = data.fireSeverity || 'CRITICAL';
      setFirebaseFireStatus(fStatus);
      setFirebaseFireSeverity(fSeverity);

      // Extract values
      const tempVal = data.temperature !== undefined ? parseFloat(data.temperature) : sensorsRef.current.temp.val;
      const smokeVal = data.gasValue !== undefined ? parseFloat(data.gasValue) : sensorsRef.current.smoke.val;
      const flameDetected = data.flameState !== undefined && parseInt(data.flameState) === 0;
      const flameVal = flameDetected ? thresholds.flame : 0.0;

      // Evaluate sensor status warnings/alarms
      let tempStatus = 'SAFE';
      if (tempVal >= thresholds.temp) tempStatus = 'CRITICAL';
      else if (tempVal >= thresholds.temp * 0.75) tempStatus = 'WARNING';

      let smokeStatus = 'SAFE';
      if (smokeVal >= thresholds.smoke) smokeStatus = 'CRITICAL';
      else if (smokeVal >= thresholds.smoke * 0.75) smokeStatus = 'WARNING';

      let flameStatus = 'SAFE';
      if (flameVal >= thresholds.flame) flameStatus = 'CRITICAL';
      else if (flameVal >= thresholds.flame * 0.5) flameStatus = 'WARNING';

      // Overall System state calculation
      let maxSeverity = 'SAFE';
      if (tempStatus === 'CRITICAL' || smokeStatus === 'CRITICAL' || flameStatus === 'CRITICAL') {
        maxSeverity = 'CRITICAL';
      } else if (tempStatus === 'WARNING' || smokeStatus === 'WARNING' || flameStatus === 'WARNING') {
        maxSeverity = 'WARNING';
      }

      if (emergencyOverrideRef.current) {
        maxSeverity = 'CRITICAL';
      }

      // Check transition
      if (maxSeverity !== systemStateRef.current) {
        triggerStateTransitionLogs(systemStateRef.current, maxSeverity, tempVal, smokeVal, flameVal);
      }

      setSystemState(maxSeverity);

      // Evaluate Auto-Action mode
      if (maxSeverity === 'CRITICAL' && autoModeRef.current && !sprinklerActiveRef.current) {
        setSprinklerActive(true);
        addResponseActionLog('ACTUATOR-ON', 'Sprinklers activated via AUTO-RESPONSE protocols.');
        createTimelineAlert('SPRINKLERS ENGAGED', 'Water discharge commenced via AUTO-RESPONSE protocols.', 'info', 'All Sectors - Ceilings');
      }

      // Update sensors state
      setSensors((prev) => ({
        temp: { val: tempVal, peak: Math.max(prev.temp.peak, tempVal), min: Math.min(prev.temp.min, tempVal), status: tempStatus, active: true },
        smoke: { val: smokeVal, peak: Math.max(prev.smoke.peak, smokeVal), min: Math.min(prev.smoke.min, smokeVal), status: smokeStatus, active: true },
        flame: { val: flameVal, peak: Math.max(prev.flame.peak, flameVal), min: Math.min(prev.flame.min, flameVal), status: flameStatus, active: true }
      }));

      // Sync Health badges
      setDeviceHealth((prev) => {
        const next = { ...prev };
        if (data.buzzer === true) {
          next.pump = 'Active Alert';
        } else if (sprinklerActiveRef.current) {
          next.pump = 'Active';
        } else {
          next.pump = 'Ready';
        }
        return next;
      });
    });

    return () => {
      unsubscribeConnected();
      unsubscribeSensors();
    };
  }, []);

  // Monitor Emergency Alert system behaviors
  useEffect(() => {
    if (isFireActive) {
      // 1. Play siren if alert popup is not dismissed
      if (!alertDismissed) {
        audioService.startSiren();
      } else {
        audioService.stopSiren();
      }

      // 2. Trigger browser push notification once per active alert cycle
      if (!lastFireActiveRef.current) {
        notificationService.show(
          "🚨 Fire Detected",
          `Hazard Severity: ${activeSeverity.toUpperCase()}. Please evacuate immediately. Stay Safe.`
        );
      }
    } else {
      // Stop loop when fire resolves
      audioService.stopSiren();
      // Reset dismiss state for the next alert cycle
      setAlertDismissed(false);
    }

    lastFireActiveRef.current = isFireActive;
  }, [isFireActive, activeSeverity, alertDismissed]);

  const triggerStateTransitionLogs = (fromState, toState, tempVal, smokeVal, flameVal) => {
    let title = '';
    let msg = '';
    const loc = 'Sector-A Factory Assembly Area';

    if (toState === 'CRITICAL') {
      title = 'CRITICAL BREACH DETECTED';
      msg = `Hazard levels exceeded critical limits! Temp: ${tempVal.toFixed(1)}°C, Smoke: ${smokeVal.toFixed(1)}%, Flame: ${flameVal.toFixed(2)} W/m²`;
      
      recordFireIncident(tempVal, smokeVal, flameVal);
      addResponseActionLog('ALARM', 'Siren Array Activated - Building Evacuation Command Sent.');
    } else if (toState === 'WARNING') {
      title = 'SAFETY ENVELOPE WARNING';
      msg = `Sensors approaching limits. Inspect Area.`;
    } else if (toState === 'SAFE' && fromState === 'CRITICAL') {
      title = 'THREAT DISARMED';
      msg = `All safety checks returned normal. Threat neutralized.`;
      
      if (autoModeRef.current && sprinklerActiveRef.current) {
        setSprinklerActive(false);
        addResponseActionLog('ACTUATOR-OFF', 'Sprinklers closed via AUTO-COOLDOWN.');
      }
    }

    if (toState !== 'SAFE') {
      createTimelineAlert(title, msg, toState.toLowerCase(), loc);
    }
  };

  const recordFireIncident = (tempVal, smokeVal, flameVal) => {
    const now = new Date();
    const fireDate = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
    const fireTime = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    const alertTime = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });

    const tempActive = tempVal >= thresholds.temp;
    const smokeActive = smokeVal >= thresholds.smoke;
    const flameActive = flameVal >= thresholds.flame;

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
      fireTime,
      alertTime,
      sensors: {
        flame: isFlameActive,
        smoke: isSmokeActive,
        temp: isTempActive
      },
      status: 'Alert Sent Successfully'
    };

    setIncidents((prev) => {
      const list = [incident, ...prev];
      localStorage.setItem('fire_incidents', JSON.stringify(list));
      return list;
    });
  };

  const addResponseActionLog = (type, details) => {
    const time = new Date().toLocaleTimeString([], { hour12: false });
    const log = { type, time, details };
    setResponseLogs((prev) => [log, ...prev]);
  };

  const createTimelineAlert = (title, message, severity, location) => {
    const timestamp = new Date().toLocaleTimeString([], { hour12: false });
    const datestamp = new Date().toLocaleDateString();
    const alert = { title, message, severity, location, timestamp, datestamp };
    setActiveAlerts((prev) => [alert, ...prev]);
  };

  const switchTab = (tabId) => {
    setCurrentTab(tabId);
    setTimeout(() => {
      if (tabId === 'dashboard' && mainChartRef.current) mainChartRef.current.update();
      if (tabId === 'sensors') {
        if (tempChartRef.current) tempChartRef.current.update();
        if (smokeChartRef.current) smokeChartRef.current.update();
        if (flameChartRef.current) flameChartRef.current.update();
      }
    }, 50);
  };

  const triggerManualOverride = () => {
    const newVal = !emergencyOverride;
    setEmergencyOverride(newVal);

    // Update overall system threat state instantly
    let nextState = systemState;
    if (newVal) {
      nextState = 'CRITICAL';
    } else {
      // Re-evaluate baseline sensors
      const tempCritical = sensors.temp.val >= thresholds.temp;
      const smokeCritical = sensors.smoke.val >= thresholds.smoke;
      const flameCritical = sensors.flame.val >= thresholds.flame;
      
      const tempWarning = sensors.temp.val >= thresholds.temp * 0.75;
      const smokeWarning = sensors.smoke.val >= thresholds.smoke * 0.75;
      const flameWarning = sensors.flame.val >= thresholds.flame * 0.5;

      if (tempCritical || smokeCritical || flameCritical) {
        nextState = 'CRITICAL';
      } else if (tempWarning || smokeWarning || flameWarning) {
        nextState = 'WARNING';
      } else {
        nextState = 'SAFE';
      }
    }

    if (nextState !== systemState) {
      triggerStateTransitionLogs(systemState, nextState, sensors.temp.val, sensors.smoke.val, sensors.flame.val);
      setSystemState(nextState);
    }
  };

  const toggleSprinkler = () => {
    const nextVal = !sprinklerActive;
    setSprinklerActive(nextVal);
    addResponseActionLog(nextVal ? 'ACTUATOR-ON' : 'ACTUATOR-OFF', `Sprinklers ${nextVal ? 'activated' : 'closed'} via MANUAL-OVERRIDE`);
    if (nextVal) {
      createTimelineAlert('SPRINKLERS ENGAGED', 'Water discharge commenced via MANUAL-OVERRIDE protocols.', 'info', 'All Sectors - Ceilings');
    }
  };

  const toggleAutoMode = () => {
    const nextVal = !autoMode;
    setAutoMode(nextVal);
    addResponseActionLog('MODE-CHANGE', `Auto Fire Defense ${nextVal ? 'ENABLED' : 'DISABLED'}.`);
  };

  const runDiagnosticTest = () => {
    if (incidentStage !== 0) return;
    switchTab('dashboard');
    setIncidentStage(1);
    addResponseActionLog('DIAGNOSTICS', 'Mock hazard drill simulation initialized.');
    createTimelineAlert(
      'DRILL TESTING COMMENCED',
      'Diagnostics safety simulation active. Monitoring sensor behavior.',
      'info',
      'System Diagnostic Console'
    );
  };

  const resetEntireSystem = () => {
    setIncidentStage(0);
    setEmergencyOverride(false);
    setSprinklerActive(false);
    setAlertDismissed(false);
    setFirebaseFireStatus(false);
    setFirebaseFireSeverity('CRITICAL');

    setSensors({
      temp: { val: 24.5, peak: 24.5, min: 24.5, status: 'SAFE', active: true },
      smoke: { val: 12.1, peak: 12.1, min: 12.1, status: 'SAFE', active: true },
      flame: { val: 0.0, peak: 0.0, min: 0.0, status: 'SAFE', active: true }
    });

    // Reset chart buffers
    chartLabelsRef.current.fill('');
    chartTempDataRef.current.fill(24.5);
    chartSmokeDataRef.current.fill(12.1);
    chartFlameDataRef.current.fill(0.0);

    if (mainChartRef.current) mainChartRef.current.update('none');
    if (tempChartRef.current) tempChartRef.current.update('none');
    if (smokeChartRef.current) smokeChartRef.current.update('none');
    if (flameChartRef.current) flameChartRef.current.update('none');

    setSystemState('SAFE');

    addResponseActionLog('SYSTEM-RESET', 'Diagnostic states cleared. System returned to default calibration.');
    createTimelineAlert('SYSTEM RESET', 'Telemetry baselines and control systems calibrated.', 'info', 'Server core');
  };

  const handlePopupClose = () => {
    setAlertDismissed(true);
  };

  const handlePopupViewDashboard = () => {
    setAlertDismissed(true);
    switchTab('dashboard');
    setTimeout(() => {
      const element = document.querySelector('.sensor-summary-row');
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 150);
  };

  const getSystemStateDesc = () => {
    if (systemState === 'CRITICAL') {
      return 'Hazard breach active! Sprinkler actuators activated. Evacuate building sector.';
    } else if (systemState === 'WARNING') {
      return 'Environmental variables are leaking past baseline levels. Site dispatch advised.';
    }
    return 'All safety variables operating inside baseline security envelopes.';
  };

  return (
    <>
      {/* Sticky Flashing Emergency Banner */}
      <EmergencyBanner active={isFireActive} />

      {/* Screen flash border overlay */}
      <div
        className="critical-alarm-overlay"
        id="critical-overlay"
        style={{ display: systemState === 'CRITICAL' ? 'block' : 'none' }}
      />

      {/* Main Top Nav */}
      <nav className="top-nav">
        <div className="nav-brand">
          <svg className="brand-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path
              d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z">
            </path>
          </svg>
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
            <span>FIRESHIELD PRO</span>
            <span className="brand-subtext-scada">Smart Fire Detection System</span>
          </div>
        </div>

        <ul className="nav-tabs">
          <li>
            <button
              className={`nav-tab-btn ${currentTab === 'dashboard' ? 'active' : ''}`}
              id="btn-tab-dashboard"
              onClick={() => switchTab('dashboard')}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="9"></rect>
                <rect x="14" y="3" width="7" height="5"></rect>
                <rect x="14" y="12" width="7" height="9"></rect>
                <rect x="3" y="16" width="7" height="5"></rect>
              </svg>
              Dashboard
            </button>
          </li>
          <li>
            <button
              className={`nav-tab-btn ${currentTab === 'sensors' ? 'active' : ''}`}
              id="btn-tab-sensors"
              onClick={() => switchTab('sensors')}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3z"></path>
                <path d="M6 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3z"></path>
                <path d="M12 8v8"></path>
              </svg>
              Sensors
            </button>
          </li>
          <li>
            <button
              className={`nav-tab-btn ${currentTab === 'history' ? 'active' : ''}`}
              id="btn-tab-history"
              onClick={() => switchTab('history')}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
              History
            </button>
          </li>
        </ul>

        <div className="nav-status">
          <div className="status-indicator">
            <span className="status-dot"></span>
            <span>ONLINE</span>
          </div>
          <div className="nav-time" id="realtime-clock">{timeStr}</div>
        </div>
      </nav>

      {/* Main content wrapper (blurs when popup is active) */}
      <main className={`main-wrapper ${isFireActive && !alertDismissed ? 'is-blurred' : ''}`}>
        
        {/* 1. DASHBOARD PAGE */}
        <section id="page-dashboard" className={`page-section ${currentTab === 'dashboard' ? 'active' : ''}`}>
          <div className="page-header">
            <div className="page-title">
              <h1>Control Center Dashboard</h1>
              <p>Building safety oversight, automatic fire defenses, and device network telemetry grid.</p>
            </div>
          </div>

          <div className="dashboard-grid">
            {/* Left Panel */}
            <div className="left-panel">
              {/* Threat Status Card */}
              <div className={`glass-panel status-card state-${systemState.toLowerCase()}`} id="dashboard-status-card">
                <div className="status-card-header">System Threat Level</div>
                <div className="status-card-body">
                  <span className="status-value" id="dashboard-status-val">{systemState}</span>
                  <span className="status-description" id="dashboard-status-desc">{getSystemStateDesc()}</span>
                </div>
                <div className="status-card-footer">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24"
                    fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                  </svg>
                  <span id="dashboard-last-update">Last Check: {timeStr || 'Just Now'}</span>
                </div>
              </div>

              {/* Quick Actions Panel */}
              <div className="glass-panel">
                <div className="panel-title">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
                    fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="5 3 19 12 5 21 5 3"></polygon>
                  </svg>
                  Quick Actions
                </div>
                <div className="action-buttons" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', width: '100%' }}>
                    <button className="btn-secondary" onClick={() => switchTab('sensors')} style={{ flex: 1, margin: 0 }}>
                      View Live Sensors
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
                        fill="none" stroke="currentColor" strokeWidth="2" style={{ marginLeft: '4px' }}>
                        <polyline points="9 18 15 12 9 6"></polyline>
                      </svg>
                    </button>
                    <button className="btn-secondary" onClick={() => switchTab('history')} style={{ flex: 1, margin: 0 }}>
                      View Alert History
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
                        fill="none" stroke="currentColor" strokeWidth="2" style={{ marginLeft: '4px' }}>
                        <polyline points="9 18 15 12 9 6"></polyline>
                      </svg>
                    </button>
                  </div>
                  <button
                    className={`btn-emergency ${emergencyOverride ? 'active' : ''}`}
                    id="emergency-override-btn"
                    onClick={triggerManualOverride}
                    style={{ margin: 0, width: '100%' }}
                  >
                    {emergencyOverride ? (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        Cancel Override
                      </>
                    ) : (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                        Emergency Override
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Local Controls Panel */}
              <div className="glass-panel">
                <div className="panel-title">🔧 Automatic Controls & Override</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', width: '100%' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Auto Fire Defense Mode</span>
                    <label className="switch">
                      <input type="checkbox" checked={autoMode} onChange={toggleAutoMode} />
                      <span className="slider round"></span>
                    </label>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Actuator Sprinkler Pump</span>
                    <label className="switch">
                      <input type="checkbox" checked={sprinklerActive} onChange={toggleSprinkler} />
                      <span className="slider round"></span>
                    </label>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                    <button className="btn-secondary" onClick={runDiagnosticTest} style={{ flex: 1, margin: 0 }}>🧪 Diagnostics Test</button>
                    <button className="btn-secondary" onClick={resetEntireSystem} style={{ flex: 1, margin: 0 }}>🔄 Reset System</button>
                  </div>
                </div>
              </div>
            </div>

            {/* Center Panel (Mini cards & charts) */}
            <div className="center-panel">
              <div className="sensor-summary-row">
                {/* Temp */}
                <div className="glass-panel sensor-mini-card">
                  <div className="sensor-mini-title">
                    <span>🌡️ Temperature</span>
                    <span className="sensor-spark-sparkle" style={{ color: 'var(--color-critical)' }}>●</span>
                  </div>
                  <div className="sensor-mini-val-container">
                    <span className="sensor-mini-val" id="mini-temp">{sensors.temp.val.toFixed(1)}</span>
                    <span className="sensor-mini-unit">°C</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                    <span className={`sensor-mini-status ${sensors.temp.status.toLowerCase()}`} id="mini-temp-status">{sensors.temp.status}</span>
                    <span className="sensor-mini-trend-indicator" style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Stable</span>
                  </div>
                </div>

                {/* Smoke */}
                <div className="glass-panel sensor-mini-card">
                  <div className="sensor-mini-title">
                    <span>💨 Smoke</span>
                    <span className="sensor-spark-sparkle" style={{ color: 'var(--text-secondary)' }}>●</span>
                  </div>
                  <div className="sensor-mini-val-container">
                    <span className="sensor-mini-val" id="mini-smoke">{sensors.smoke.val.toFixed(0)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                    <span className={`sensor-mini-status ${sensors.smoke.status.toLowerCase()}`} id="mini-smoke-status">{sensors.smoke.status}</span>
                    <span className="sensor-mini-trend-indicator" style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Stable</span>
                  </div>
                </div>

                {/* Flame */}
                <div className="glass-panel sensor-mini-card">
                  <div className="sensor-mini-title">
                    <span>🔥 Flame</span>
                    <span className="sensor-spark-sparkle" style={{ color: 'var(--color-warn)' }}>●</span>
                  </div>
                  <div className="sensor-mini-val-container">
                    <span className="sensor-mini-val" id="mini-flame">{sensors.flame.val.toFixed(2)}</span>
                    <span className="sensor-mini-unit">W/m²</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                    <span className={`sensor-mini-status ${sensors.flame.status.toLowerCase()}`} id="mini-flame-status">{sensors.flame.status}</span>
                    <span className="sensor-mini-trend-indicator" style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Stable</span>
                  </div>
                </div>
              </div>

              {/* Graph Card */}
              <div className="glass-panel">
                <div className="panel-title" style={{ marginBottom: '0.5rem' }}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
                    fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '4px' }}>
                    <path d="M3 3v18h18"></path>
                    <path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3"></path>
                  </svg>
                  Live Sensor Analytics Graph (Real-time fluctuations)
                </div>
                <div className="graph-container">
                  <canvas ref={mainCanvasRef} id="multiSensorChart"></canvas>
                </div>
              </div>
            </div>

            {/* Right Panel (Health & logs) */}
            <div className="right-panel">
              {/* Health status */}
              <div className="glass-panel">
                <div className="panel-title">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
                    fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '4px' }}>
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12 6 12 12 16 14"></polyline>
                  </svg>
                  Sensor Health (IoT Node Status)
                </div>
                <div className="device-status-list">
                  <div className="dev-status-item">
                    <span>Temperature Sensor</span>
                    <span className="dev-badge dev-active" id="health-temp-badge">● Active</span>
                  </div>
                  <div className="dev-status-item">
                    <span>Smoke Sensor</span>
                    <span className="dev-badge dev-active" id="health-smoke-badge">● Active</span>
                  </div>
                  <div className="dev-status-item">
                    <span>Flame Sensor</span>
                    <span className="dev-badge dev-active" id="health-flame-badge">● Active</span>
                  </div>
                  <div className="dev-status-item">
                    <span>ESP32 Control Board</span>
                    <span className={`dev-badge ${firebaseConnected ? 'dev-active' : 'dev-offline'}`} id="health-esp32-badge">
                      {firebaseConnected ? '● Connected' : '● Disconnected'}
                    </span>
                  </div>
                  <div className="dev-status-item">
                    <span>Wi-Fi Network Module</span>
                    <span className={`dev-badge ${firebaseConnected ? 'dev-active' : 'dev-offline'}`} id="health-wifi-badge">
                      {firebaseConnected ? '● Connected' : '● Disconnected'}
                    </span>
                  </div>
                  <div className="dev-status-item">
                    <span>Water Pump Actuator</span>
                    <span className={`dev-badge ${sprinklerActive ? 'dev-offline' : 'dev-active'}`} id="health-pump-badge">
                      {sprinklerActive ? '● ACTIVE' : '● Ready'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Latest incident card */}
              <div className="glass-panel" id="latest-fire-alert-card">
                <div className="panel-title">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
                    fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '4px' }}>
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                    <line x1="12" y1="9" x2="12" y2="13"></line>
                    <line x1="12" y1="17" x2="12.01" y2="17"></line>
                  </svg>
                  Latest Fire Alert
                </div>
                <div id="latest-alert-container">
                  {incidents.length > 0 ? (
                    <div className="latest-alert-content" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', padding: '0.5rem 0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontWeight: 'bold', color: 'var(--color-critical)' }}>🔥 Alert #{incidents.length}</span>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{incidents[0].date}</span>
                      </div>
                      <div style={{ fontSize: '0.9rem' }}>
                        Fire Time: {incidents[0].fireTime}
                      </div>
                      <div style={{ fontSize: '0.95rem', display: 'flex', gap: '0.4rem' }}>
                        <span>Active Nodes:</span>
                        {incidents[0].sensors.temp && <span style={{ color: 'var(--color-critical)', fontWeight: 'bold' }}>Temp</span>}
                        {incidents[0].sensors.smoke && <span style={{ color: 'var(--color-critical)', fontWeight: 'bold' }}>Smoke</span>}
                        {incidents[0].sensors.flame && <span style={{ color: 'var(--color-critical)', fontWeight: 'bold' }}>Flame</span>}
                      </div>
                      <div className="incident-status" style={{ fontSize: '0.8rem', color: 'var(--color-safe)', fontWeight: '600' }}>
                        ✔ {incidents[0].status}
                      </div>
                    </div>
                  ) : (
                    <div style={{ color: 'var(--color-safe)', fontStyle: 'italic', textAlign: 'center', padding: '1rem 0' }}>
                      ✔ No Alarms Logged
                    </div>
                  )}
                </div>
              </div>

              {/* Event Logs console */}
              <div className="glass-panel">
                <div className="panel-title">🛡️ System Event logs</div>
                <div id="response-event-logs" className="event-log-container" style={{ maxHeight: '180px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {responseLogs.length === 0 ? (
                    <div className="event-log-item" style={{ color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'center', padding: '1.5rem 0' }}>
                      Waiting for automated response logs...
                    </div>
                  ) : (
                    responseLogs.map((log, idx) => (
                      <div className="event-log-item" key={idx} style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.4rem' }}>
                        <div className="event-log-header" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.2rem' }}>
                          <span style={{ color: 'var(--color-accent)', fontWeight: 'bold' }}>[{log.type}]</span>
                          <span>{log.time}</span>
                        </div>
                        <div style={{ fontSize: '0.85rem' }}>{log.details}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 2. SENSORS PAGE */}
        <section id="page-sensors" className={`page-section ${currentTab === 'sensors' ? 'active' : ''}`}>
          <div className="page-header">
            <div className="page-title">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h1>Live Sensors Telemetry</h1>
                <span className="status-indicator"
                  style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                  <span className="status-dot"></span>
                  <span style={{ color: 'var(--color-safe)', fontSize: '0.75rem' }}>ONLINE</span>
                </span>
              </div>
              <p>Live technical trends, session peaks and connectivity telemetry for each fire variable.</p>
            </div>
          </div>

          <div className="sensor-page-grid">
            {/* Temp Details */}
            <div className="glass-panel sensor-trend-card">
              <div className="sensor-detail-panel">
                <div className="sensor-detail-header">
                  <div className="sensor-detail-icon">🌡️</div>
                  <div>
                    <div className="sensor-detail-name">Temperature Sensor</div>
                    <span className="sensor-detail-id">S-TEMP-001 (ESP32 PIN-32)</span>
                  </div>
                </div>
                <div className="sensor-detail-body">
                  <div className="sensor-detail-val">
                    <span>{sensors.temp.val.toFixed(1)}</span>
                    <span className="sensor-detail-unit">°C</span>
                  </div>
                  <div className="sensor-detail-status-indicator">
                    <span className={`status-dot ${sensors.temp.status.toLowerCase()}`} id="detail-temp-dot"></span>
                    <span id="detail-temp-status-lbl" style={{ color: sensors.temp.status === 'CRITICAL' ? 'var(--color-critical)' : sensors.temp.status === 'WARNING' ? 'var(--color-warn)' : 'var(--color-safe)' }}>
                      {sensors.temp.status === 'CRITICAL' ? 'CRITICAL LIMIT BREACHED' : sensors.temp.status === 'WARNING' ? 'ABNORMAL DEVIATION WARNING' : 'Safe Operational Range'}
                    </span>
                  </div>
                </div>
                <div className="sensor-detail-stats">
                  <div className="stat-item"><span className="stat-lbl">Sensor Status:</span><span className="stat-val" style={{ color: 'var(--color-safe)' }}>● ACTIVE</span></div>
                  <div className="stat-item"><span className="stat-lbl">Session Peak:</span><span className="stat-val" id="detail-temp-peak">{sensors.temp.peak.toFixed(1)} °C</span></div>
                </div>
              </div>
              <div className="sensor-detail-graph">
                <canvas ref={tempCanvasRef} id="tempDetailChart"></canvas>
              </div>
            </div>

            {/* Smoke Details */}
            <div className="glass-panel sensor-trend-card">
              <div className="sensor-detail-panel">
                <div className="sensor-detail-header">
                  <div className="sensor-detail-icon">💨</div>
                  <div>
                    <div className="sensor-detail-name">Smoke Density Sensor</div>
                    <span className="sensor-detail-id">S-SMOK-002 (ESP32 PIN-33)</span>
                  </div>
                </div>
                <div className="sensor-detail-body">
                  <div className="sensor-detail-val">
                    <span>{sensors.smoke.val.toFixed(0)}</span>
                    <span className="sensor-detail-unit">%</span>
                  </div>
                  <div className="sensor-detail-status-indicator">
                    <span className={`status-dot ${sensors.smoke.status.toLowerCase()}`} id="detail-smoke-dot"></span>
                    <span id="detail-smoke-status-lbl" style={{ color: sensors.smoke.status === 'CRITICAL' ? 'var(--color-critical)' : sensors.smoke.status === 'WARNING' ? 'var(--color-warn)' : 'var(--color-safe)' }}>
                      {sensors.smoke.status === 'CRITICAL' ? 'CRITICAL LIMIT BREACHED' : sensors.smoke.status === 'WARNING' ? 'ABNORMAL DEVIATION WARNING' : 'Safe Operational Range'}
                    </span>
                  </div>
                </div>
                <div className="sensor-detail-stats">
                  <div className="stat-item"><span className="stat-lbl">Sensor Status:</span><span className="stat-val" style={{ color: 'var(--color-safe)' }}>● ACTIVE</span></div>
                  <div className="stat-item"><span className="stat-lbl">Session Peak:</span><span className="stat-val" id="detail-smoke-peak">{sensors.smoke.peak.toFixed(0)}%</span></div>
                </div>
              </div>
              <div className="sensor-detail-graph">
                <canvas ref={smokeCanvasRef} id="smokeDetailChart"></canvas>
              </div>
            </div>

            {/* Flame Details */}
            <div className="glass-panel sensor-trend-card">
              <div className="sensor-detail-panel">
                <div className="sensor-detail-header">
                  <div className="sensor-detail-icon">🔥</div>
                  <div>
                    <div className="sensor-detail-name">Flame Sensor</div>
                    <span className="sensor-detail-id">S-FLAM-003 (ESP32 PIN-34)</span>
                  </div>
                </div>
                <div className="sensor-detail-body">
                  <div className="sensor-detail-val">
                    <span>{sensors.flame.val.toFixed(2)}</span>
                    <span className="sensor-detail-unit">W/m²</span>
                  </div>
                  <div className="sensor-detail-status-indicator">
                    <span className={`status-dot ${sensors.flame.status.toLowerCase()}`} id="detail-flame-dot"></span>
                    <span id="detail-flame-status-lbl" style={{ color: sensors.flame.status === 'CRITICAL' ? 'var(--color-critical)' : sensors.flame.status === 'WARNING' ? 'var(--color-warn)' : 'var(--color-safe)' }}>
                      {sensors.flame.status === 'CRITICAL' ? 'CRITICAL LIMIT BREACHED' : sensors.flame.status === 'WARNING' ? 'ABNORMAL DEVIATION WARNING' : 'Safe Operational Range'}
                    </span>
                  </div>
                </div>
                <div className="sensor-detail-stats">
                  <div className="stat-item"><span className="stat-lbl">Sensor Status:</span><span className="stat-val" style={{ color: 'var(--color-safe)' }}>● ACTIVE</span></div>
                  <div className="stat-item"><span className="stat-lbl">Session Peak:</span><span className="stat-val" id="detail-flame-peak">{sensors.flame.peak.toFixed(2)} W/m²</span></div>
                </div>
              </div>
              <div className="sensor-detail-graph">
                <canvas ref={flameCanvasRef} id="flameDetailChart"></canvas>
              </div>
            </div>
          </div>
        </section>

        {/* 3. HISTORY / LOGS PAGE */}
        <section id="page-history" className={`page-section ${currentTab === 'history' ? 'active' : ''}`}>
          <div className="page-header">
            <div className="page-title">
              <h1>Fire Incident History</h1>
              <p>Safety database containing chronological records of fire occurrences and alert dispatches.</p>
            </div>
          </div>

          <div className="incident-history-container" id="incident-history-list">
            {incidents.length === 0 ? (
              <div className="glass-panel" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                No fire incidents recorded in the safety logs.
              </div>
            ) : (
              incidents.map((incident, index) => {
                const incidentNumber = incidents.length - index;
                return (
                  <div className="glass-panel incident-card" key={index}>
                    <div className="incident-header">
                      🔥 Fire Incident #{incidentNumber}
                    </div>
                    <div className="incident-details">
                      <div className="detail-row">
                        <span>📅</span>
                        <span className="detail-label">Date:</span>
                        <span className="detail-value">{incident.date}</span>
                      </div>
                      <div className="detail-row">
                        <span>🕒</span>
                        <span className="detail-label">Fire Time:</span>
                        <span className="detail-value">{incident.fireTime}</span>
                      </div>
                      <div className="detail-row">
                        <span>🚨</span>
                        <span className="detail-label">Alert Time:</span>
                        <span className="detail-value">{incident.alertTime}</span>
                      </div>
                      
                      <div className="incident-sensors-section">
                        <div className="section-title">Sensors Active:</div>
                        <div className="sensor-list">
                          <div className="sensor-item">
                            <span>{incident.sensors.flame ? '✅' : '❌'}</span>
                            <span>Flame Sensor</span>
                          </div>
                          <div className="sensor-item">
                            <span>{incident.sensors.smoke ? '✅' : '❌'}</span>
                            <span>Smoke Sensor</span>
                          </div>
                          <div className="sensor-item">
                            <span>{incident.sensors.temp ? '✅' : '❌'}</span>
                            <span>Temperature Sensor</span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="incident-status-section">
                        <div className="section-title">Status:</div>
                        <div className="incident-status">
                          <span>✔</span> {incident.status}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

      </main>

      {/* Fullscreen Professional Emergency Popup rendering */}
      {isFireActive && !alertDismissed && (
        <EmergencyPopup
          severity={activeSeverity}
          onClose={handlePopupClose}
          onViewDashboard={handlePopupViewDashboard}
        />
      )}
    </>
  );
}
