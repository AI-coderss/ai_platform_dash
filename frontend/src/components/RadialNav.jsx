/* eslint-disable react-hooks/exhaustive-deps */
/* RadialNav.jsx — bottom-center radial website navigator (JS only)
   - Wheel rotation with mouse wheel
   - Tangential icons + tiny labels
   - Shadow separators between sectors
   - No boxes/cards around icons
   - External CSS: ../styles/RadialNav.css
*/
/* eslint-disable react-hooks/exhaustive-deps */
/* RadialNav.jsx — bottom-center radial website navigator (JS only)
   - Smooth mouse-follow wedge with easing
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

  // --- smooth wedge start (deg) ---
  const [wedgeDeg, setWedgeDeg] = useState(0);
  const targetStartRef = useRef(0);

  const faceRef = useRef(null);

  // --- rotation (drag) state & helpers (ADDED) ---
  const draggingRef = useRef(false);
  const startAngleRef = useRef(0);
  const rotorStartRef = useRef(0);

  const clampDeg = (d) => ((d % 360) + 360) % 360;

  // absolute angle (0..360) from pointer
  const eventAngle = (ev) => {
    const r = faceRef.current.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const dx = ev.clientX - cx;
    const dy = ev.clientY - cy;
    let a = (Math.atan2(dy, dx) * 180) / Math.PI; // -180..180
    if (a < 0) a += 360;                            // -> 0..360
    return { a, dx, dy, r };
  };

  // Default website sections
  const navItems = useMemo(
    () =>
      items && items.length
        ? items
        : [
            { id: "about",    label: "About",    icon: <FaHome />,             targetId: "hero" },
            { id: "products", label: "Products", icon: <FaThLarge />,          targetId: "products" },
            { id: "tutorial", label: "Tutorial", icon: <FaPlayCircle />,       targetId: "watch_tutorial" },
            { id: "policy",   label: "Policy",   icon: <FaShieldAlt />,        targetId: "policy" },
            { id: "contact",  label: "Contact",  icon: <FaEnvelopeOpenText />, targetId: "contact" },
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

  // Wheel rotation (discrete sectors, like a detented dial)
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

  // Init wedge to selected sector whenever selection/count changes
  useEffect(() => {
    const start = (selIdx * sector) % 360;
    setWedgeDeg(start);
    targetStartRef.current = start;
  }, [selIdx, sector, isOpen]);

  // Smoothly ease wedge toward target angle (shortest path on the circle)
  useEffect(() => {
    if (!isOpen) return;
    let raf;
    const smooth = () => {
      setWedgeDeg((prev) => {
        const target = targetStartRef.current;
        // shortest angular delta in [-180, 180]
        let diff = ((target - prev + 540) % 360) - 180;
        const step = diff * 0.18; // easing factor (0.1–0.25 feels like real hardware)
        if (Math.abs(diff) < 0.35) return target;
        let next = prev + step;
        next = ((next % 360) + 360) % 360;
        return next;
      });
      raf = requestAnimationFrame(smooth);
    };
    raf = requestAnimationFrame(smooth);
    return () => cancelAnimationFrame(raf);
  }, [isOpen]);

  // Hover tracking from cursor position + live lighting
  const updateHoverFromMouse = (ev) => {
    if (!isOpen || !faceRef.current) return;
    const r = faceRef.current.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const dx = ev.clientX - cx;
    const dy = ev.clientY - cy;

    // absolute angle (0..360), 0 = +X (right), 90 = down?
    let a = (Math.atan2(dy, dx) * 180) / Math.PI; // -180..180
    if (a < 0) a += 360; // 0..360

    // compensate rotor rotation so highlight tracks ITEMS
    const local = ((a - rotorDeg) % 360 + 360) % 360;

    // index + sector start snapped to sector grid
    const idx = Math.floor(local / sector);
    const start = Math.floor(local / sector) * sector;

    setHoverIdx(idx);

    // tell the smoother where to go
    targetStartRef.current = start;

    // live light (0–100%)
    const lx = Math.max(0, Math.min(100, (dx / (r.width / 2)) * 50 + 50));
    const ly = Math.max(0, Math.min(100, (dy / (r.height / 2)) * 50 + 50));
    faceRef.current.style.setProperty("--rn-light-x", `${lx}%`);
    faceRef.current.style.setProperty("--rn-light-y", `${ly}%`);
  };

  const clearHover = () => {
    setHoverIdx(null);
    // glide back to the selected sector
    targetStartRef.current = (selIdx * sector) % 360;
    if (faceRef.current) {
      faceRef.current.style.setProperty("--rn-light-x", "50%");
      faceRef.current.style.setProperty("--rn-light-y", "30%");
    }
  };

  // --- drag-to-rotate handlers (ADDED) ---
  const onPointerDown = (ev) => {
    if (!isOpen || !faceRef.current) return;
    draggingRef.current = true;
    ev.currentTarget.setPointerCapture?.(ev.pointerId);
    const { a } = eventAngle(ev);
    startAngleRef.current = a;
    rotorStartRef.current = rotorDeg;
  };

  const onPointerMove = (ev) => {
    if (!isOpen || !faceRef.current) return;

    // keep hover highlight/live light updating during drag
    updateHoverFromMouse(ev);

    if (!draggingRef.current) return;
    const { a } = eventAngle(ev);
    const delta = a - startAngleRef.current;
    setRotorDeg(clampDeg(rotorStartRef.current + delta));
  };

  const onPointerUp = (ev) => {
    if (!isOpen || !faceRef.current) return;
    draggingRef.current = false;
    ev.currentTarget.releasePointerCapture?.(ev.pointerId);
  };

  // Navigation behavior
  const runItem = (it) => {
    if (it.onClick) it.onClick();
    else if (it.targetId) {
      const el = document.getElementById(it.targetId);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (it.href) {
      window.open(it.href, "_blank", "noopener,noreferrer");
    }
    setSelIdx((hoverIdx ?? selIdx) % count);
    setIsOpen(false);
  };

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
            "--sector-start": `${wedgeDeg}deg`,
            "--sector-mid": `${(wedgeDeg + sector / 2) % 360}deg`,
            "--sector-sweep": `${sector}deg`,
          }}
          onMouseMove={updateHoverFromMouse}
          onMouseLeave={clearHover}
          onPointerDown={onPointerDown}   // ADDED
          onPointerMove={onPointerMove}   // ADDED
          onPointerUp={onPointerUp}       // ADDED
        >
          <div className="rn-ring" />
          <div className="rn-separators" />
          <div className="rn-inner" />
          <div className="rn-wedge" />
          <div className="rn-center" aria-hidden>⚙️</div>

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
                  onClick={() => runItem(it)}
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
