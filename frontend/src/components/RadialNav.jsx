/* eslint-disable react-hooks/exhaustive-deps */
/* RadialNav.jsx — bottom-center radial website navigator (JS only)
   - Wheel rotation with mouse wheel
   - Tangential icons + tiny labels
   - Shadow separators between sectors
   - No boxes/cards around icons
   - External CSS: ../styles/RadialNav.css
*/
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  FaHome,
  FaThLarge,
  FaPlayCircle,
  FaShieldAlt,
  FaEnvelopeOpenText,
  FaClipboardCheck,
} from "react-icons/fa";
import "../styles/RadialNav.css";

const RadialNav = ({ items, lift = 132 }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [rotorDeg, setRotorDeg] = useState(0);
  const [hoverIdx, setHoverIdx] = useState(null);
  const [selIdx, setSelIdx] = useState(0);
  const faceRef = useRef(null);

  // Default website sections (consistent with your app)
  const navItems = useMemo(
    () =>
      items && items.length
        ? items
        : [
            { id: "about",    label: "About",    icon: <FaHome />,            targetId: "hero" },
            { id: "products", label: "Products", icon: <FaThLarge />,         targetId: "products" },
            { id: "tutorial", label: "Tutorial", icon: <FaPlayCircle />,      targetId: "watch_tutorial" },
            { id: "policy",   label: "Policy",   icon: <FaShieldAlt />,       targetId: "policy" },
            { id: "contact",  label: "Contact",  icon: <FaEnvelopeOpenText />,targetId: "contact" },
            {
              id: "survey",
              label: "Survey",
              icon: <FaClipboardCheck />,
              href: "https://forms.visme.co/formsPlayer/zzdk184y-ai-applications-usage-at-dsah",
            },
          ],
    [items]
  );

  const count = Math.max(navItems.length, 1);
  const sector = 360 / count;

  // Close on global event
  useEffect(() => {
    const close = () => setIsOpen(false);
    window.addEventListener("tools:close", close);
    return () => window.removeEventListener("tools:close", close);
  }, []);

  // Expose lift to CSS var
  useEffect(() => {
    document.documentElement.style.setProperty("--rn-open-lift", `${lift}px`);
    return () => document.documentElement.style.removeProperty("--rn-open-lift");
  }, [lift]);

  // Wheel rotation
  useEffect(() => {
    if (!isOpen) return;
    const onWheel = (e) => {
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
      const dir = Math.sign(e.deltaY || 1);
      setRotorDeg((prev) => {
        let x = prev + (dir > 0 ? sector : -sector);
        x = ((x % 360) + 360) % 360;
        return x;
      });
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, [isOpen, sector]);

  // ESC key closes
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && setIsOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Hover tracking from cursor position
  const updateHoverFromMouse = (ev) => {
    if (!isOpen || !faceRef.current) return;
    const r = faceRef.current.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const dx = ev.clientX - cx;
    const dy = ev.clientY - cy;
    let a = (Math.atan2(dy, dx) * 180) / Math.PI; // -180..180
    if (a < 0) a += 360; // 0..360

    // compensate rotor rotation
    let idx = Math.floor((((a - rotorDeg) % 360) + 360) % 360 / sector);
    if (idx < 0) idx += count;
    setHoverIdx(idx);
  };
  const clearHover = () => setHoverIdx(null);

  // Navigation behavior
  const runItem = (it) => {
    if (it.onClick) it.onClick();
    else if (it.targetId) {
      const el = document.getElementById(it.targetId);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (it.href) {
      window.open(it.href, "_blank", "noopener,noreferrer");
    }
    setIsOpen(false);
  };

  // ✅ FIX: keep wedge directly aligned with hovered sector (remove double-rotation)
  const wedgeStart = ((hoverIdx ?? selIdx) * sector) % 360;

  return (
    <div className={`rn-root ${isOpen ? "open" : ""}`}>
      {/* Wheel / face */}
      {isOpen && (
        <div
          ref={faceRef}
          className="rn-face"
          style={{
            "--rn-count": count,
            "--rn-rotor": `${rotorDeg}deg`,
            "--sector-start": `${wedgeStart}deg`,
            "--sector-sweep": `${sector}deg`,
          }}
          onMouseMove={updateHoverFromMouse}
          onMouseLeave={clearHover}
        >
          <div className="rn-ring" />
          <div className="rn-separators" />
          <div className="rn-inner" />
          <div className="rn-wedge" />
          <div className="rn-center" aria-hidden>
            ⚙️
          </div>

          <div className="rn-rotor">
            {navItems.map((it, i) => {
              const isFocus = (hoverIdx ?? selIdx) === i;
              return (
                <button
                  key={it.id || i}
                  className={`rn-item ${isFocus ? "is-focus" : ""}`}
                  style={{ "--i": i }}
                  title={it.label}
                  aria-label={it.label}
                  onClick={() => {
                    setSelIdx(i);
                    runItem(it);
                  }}
                >
                  <span className="rn-icon">{it.icon}</span>
                  <span className="rn-label">{it.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Toggle */}
      <button
        className="rn-toggle"
        onClick={() => setIsOpen((s) => !s)}
        aria-label={isOpen ? "Close menu" : "Open menu"}
        title={isOpen ? "Close" : "Menu"}
      >
        {isOpen ? "✖" : "🧭"}
      </button>
    </div>
  );
};

export default RadialNav;

