import React from 'react';

export default function EmergencyBanner({ active }) {
  if (!active) return null;

  return (
    <div className="emergency-banner-container">
      <div className="emergency-banner" role="alert" aria-live="assertive">
        🚨 EMERGENCY • FIRE DETECTED • EVACUATE IMMEDIATELY
      </div>
    </div>
  );
}
