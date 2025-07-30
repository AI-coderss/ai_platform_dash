import React, { useState, useEffect } from 'react';
import '../styles/ThemeToggle.css';

const ThemeToggle = () => {
  const [isDark, setIsDark] = useState(false);

  // Load theme from localStorage on component mount
  useEffect(() => {
    const savedTheme = localStorage.getItem('app-theme') || 'light';
    const isDarkTheme = savedTheme === 'dark';
    setIsDark(isDarkTheme);
    applyTheme(isDarkTheme);
  }, []);

  // Apply theme to document
  const applyTheme = (isDarkTheme) => {
    const root = document.documentElement;
    
    if (isDarkTheme) {
      root.setAttribute('data-theme', 'dark');
    } else {
      root.removeAttribute('data-theme');
    }
    
    // Save to localStorage
    localStorage.setItem('app-theme', isDarkTheme ? 'dark' : 'light');
  };

  // Handle theme toggle
  const handleToggle = () => {
    const newIsDark = !isDark;
    setIsDark(newIsDark);
    applyTheme(newIsDark);
  };

  return (
    <div className="theme-toggle">
      <div className="theme-toggle-container">
        <span className="theme-label light-label">☀️ Light</span>
        <label className="toggle-switch">
          <input
            type="checkbox"
            checked={isDark}
            onChange={handleToggle}
            aria-label="Toggle theme"
          />
          <span className="slider"></span>
        </label>
        <span className="theme-label dark-label">🌙 Dark</span>
      </div>
    </div>
  );
};

export default ThemeToggle;