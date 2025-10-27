import React, { useState, useEffect } from 'react';
import '../styles/ThemeToggle.css';

const STORAGE_KEY = 'app-theme';

const ThemeToggle = () => {
  const [isDark, setIsDark] = useState(false);

  // Apply theme to document + persist + broadcast
  const applyTheme = (isDarkTheme) => {
    const root = document.documentElement;

    if (isDarkTheme) {
      root.setAttribute('data-theme', 'dark');
    } else {
      root.removeAttribute('data-theme');
    }

    // Persist
    try {
      localStorage.setItem(STORAGE_KEY, isDarkTheme ? 'dark' : 'light');
    } catch {}

    // Broadcast so other parts of the app (e.g., shaders) can react
    try {
      window.dispatchEvent(
        new CustomEvent('theme:changed', {
          detail: { isDark: isDarkTheme, mode: isDarkTheme ? 'dark' : 'light' }
        })
      );
    } catch {}
  };

  // Load theme from localStorage on component mount
  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem(STORAGE_KEY) || 'light';
      const isDarkTheme = savedTheme === 'dark';
      setIsDark(isDarkTheme);
      applyTheme(isDarkTheme);
    } catch {
      // Fallback to light
      setIsDark(false);
      applyTheme(false);
    }
  }, []);

  // Sync with changes made elsewhere (e.g., AI tool calling theme toggle)
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        const nextIsDark = e.newValue === 'dark';
        setIsDark(nextIsDark);

        // Update the DOM attribute without re-writing storage again
        const root = document.documentElement;
        if (nextIsDark) root.setAttribute('data-theme', 'dark');
        else root.removeAttribute('data-theme');

        // Fire the same broadcast to keep everything in sync
        try {
          window.dispatchEvent(
            new CustomEvent('theme:changed', {
              detail: { isDark: nextIsDark, mode: nextIsDark ? 'dark' : 'light' }
            })
          );
        } catch {}
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Handle theme toggle (local user action)
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
