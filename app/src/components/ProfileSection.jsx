import React, { useState } from 'react';
import '../styles/profile-section.css';

export default function ProfileSection({ userProfile }) {
  const [expandedButtons, setExpandedButtons] = useState({});

  if (!userProfile) return null;

  const { level, name, xp, maxXp, avatar } = userProfile;
  const progressPercent = (xp / maxXp) * 100;

  const buttons = [
    { icon: 'books-01', label: 'Học tập' },
    { icon: 'task-01', label: 'Kế hoạch' },
    { icon: 'money-bag-02', label: 'Ngân sách' },
    { icon: 'note-edit', label: 'Ghi chép' }
  ];

  const toggleButton = (index) => {
    setExpandedButtons(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  const handleButtonClick = (label) => {
    console.log('Button clicked:', label);
    // Navigate or trigger action
  };

  return (
    <div className="profile-section">
      {/* Background effects */}
      <div className="profile-bg-effect"></div>

      {/* Left: Heo + Progress Ring */}
      <div className="profile-left">
        <div className="heo-container">
          {/* Circular Progress Ring */}
          <svg className="progress-ring-wrapper" viewBox="0 0 140 140">
            <defs>
              <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style={{ stopColor: '#00ff88', stopOpacity: 1 }} />
                <stop offset="100%" style={{ stopColor: '#00cc6f', stopOpacity: 1 }} />
              </linearGradient>
            </defs>
            <circle className="progress-ring-bg" cx="70" cy="70" r="65"></circle>
            <circle
              className="progress-ring-fill"
              cx="70"
              cy="70"
              r="65"
              style={{
                strokeDasharray: 408,
                strokeDashoffset: 408 * (1 - progressPercent / 100)
              }}
            ></circle>
          </svg>

          {/* Heo Image */}
          <img
            src={avatar || '/assets/levels/pig-5.png'}
            alt="Heo"
            className="heo-character"
          />
        </div>

        {/* Level & Name */}
        <div className="profile-info">
          <div className="profile-level"><svg className="ekko-icon" width="20" height="20" aria-hidden="true"><use href="/assets/icons/ui-icons.svg#flash" /></svg> Cấp {level}</div>
          <h2>{name}</h2>
        </div>
      </div>

      {/* Right: Action Buttons */}
      <div className="buttons-stack">
        {buttons.map((btn, i) => (
          <button
            key={i}
            className={`btn-action ${expandedButtons[i] ? '' : 'collapsed'}`}
            data-title={btn.label}
            onClick={() => {
              toggleButton(i);
              handleButtonClick(btn.label);
            }}
          >
            <span className="btn-icon"><svg className="ekko-icon" width="24" height="24" aria-hidden="true"><use href={`/assets/icons/ui-icons.svg#${btn.icon}`} /></svg></span>
            <span className="btn-text">{btn.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
