/* eslint-disable react-hooks/exhaustive-deps */
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "../styles/CardCarousel.css";
import AudioPlayer from "./AudioPlayer";

/** 🔊 1-based keys match card order */
const audioMap = {
  1: "/assets/audio/ai_doctor.mp3",
  2: "/assets/audio/medical_transcription.mp3",
  3: "/assets/audio/data_analyst.mp3",
  4: "/assets/audio/report_enhancement.mp3",
  5: "/assets/audio/ivf_assistant.mp3",
  6: "/assets/audio/patient_assistant.mp3",
};

const APPS = [
  {
    id: "ai_doctor",
    title: "AI Doctor Assistant",
    img: "/assets/images/ai_doctor.jpeg",
    body:
      "RAG capabilities for medical professionals providing most accurate and comprehensive answers.",
  },
  {
    id: "transcription",
    title: "Medical Transcription",
    img: "/assets/images/transcription.jpg",
    body:
      "Whisper-powered dictation with AI grammar/structure. Edit inline and export to HIS with audit trail.",
  },
  {
    id: "bi_dashboard",
    title: "AI BI Dashboard",
    img: "/assets/images/data_analyst.jpeg",
    body:
      "KPIs for clinics, labs, and finance. Drilldowns, trend alerts, and smart commentary out of the box.",
  },
  {
    id: "report_enhance",
    title: "Report Enhancement",
    img: "/assets/images/report_enhance.jpg",
    body:
      "Real-time suggestions for clarity and medical terminology to standardize clinical communication.",
  },
  {
    id: "ivf_assistant",
    title: "IVF Training Assistant",
    img: "/assets/images/ivf.jpeg",
    body:
      "Interactive protocols, image-guided checklists, and instant Q&A grounded in your training manual.",
  },
  {
    id: "patient_avatar",
    title: "Patient Assistant Avatar",
    img: "/assets/images/pat.jpeg",
    body:
      "Low-latency speech-to-speech with a 3D avatar. Streams text + audio for immersive patient engagement.",
  },
];

const AUTOPLAY_MS = 2600;
const TRANSITION_MS = 520;

export default function CardCarousel() {
  const rootRef = useRef(null);
  const viewportRef = useRef(null);
  const canvasRef = useRef(null);                 // background canvas
  const animRef = useRef(0);                      // rAF id for canvas

  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [openId, setOpenId] = useState(null);

  const [perView, setPerView] = useState(3);
  const [slideW, setSlideW] = useState(360);      // px fallback

  // popup drag (keep your original model; just add width/height clamp)
  const popupRef = useRef(null);
  const [popupPos, setPopupPos] = useState({ x: 0, y: 0 });
  const drag = useRef({ active: false, dx: 0, dy: 0, w: 520, h: 360 });

  // ===== measurements
  useEffect(() => {
    const compute = () => {
      const vp = viewportRef.current;
      if (!vp) return;
      const w = vp.clientWidth;
      const pv = w <= 640 ? 1 : w <= 1024 ? 2 : 3;
      setPerView(pv);

      const pad = 72; // 36px left + 36px right arrow padding
      const usable = Math.max(280, w - pad);
      const slideWidth = Math.floor(usable / pv);
      setSlideW(slideWidth);

      const maxStart = Math.max(0, APPS.length - pv);
      setIndex((prev) => Math.min(prev, maxStart));
    };
    compute();
    const ro = new ResizeObserver(compute);
    if (viewportRef.current) ro.observe(viewportRef.current);
    window.addEventListener("orientationchange", compute);
    return () => { ro.disconnect(); window.removeEventListener("orientationchange", compute); };
  }, []);

  // ===== autoplay
  useEffect(() => {
    if (!playing || openId) return;
    const id = setInterval(() => {
      setIndex((prev) => {
        const maxStart = Math.max(0, APPS.length - perView);
        const next = prev + 1;
        return next > maxStart ? 0 : next;
      });
    }, AUTOPLAY_MS);
    return () => clearInterval(id);
  }, [playing, openId, perView]);

  // ===== pause on hover/touch
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onOver = () => setPlaying(false);
    const onOut = () => setPlaying(true);
    root.addEventListener("mouseenter", onOver);
    root.addEventListener("mouseleave", onOut);
    root.addEventListener("touchstart", onOver, { passive: true });
    root.addEventListener("touchend", onOut, { passive: true });
    return () => {
      root.removeEventListener("mouseenter", onOver);
      root.removeEventListener("mouseleave", onOut);
      root.removeEventListener("touchstart", onOver);
      root.removeEventListener("touchend", onOut);
    };
  }, []);

  // ===== nav
  const maxStart = Math.max(0, APPS.length - perView);
  const prev = () => setIndex((v) => Math.max(0, v - 1));
  const next = () => setIndex((v) => (v >= maxStart ? 0 : v + 1));
  const goTo = (i) => setIndex(i);

  // ===== popup open/close
  const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

  const openPopup = (id, i) => {
    setIndex(Math.min(i, maxStart));
    const vw = window.innerWidth, vh = window.innerHeight;
    const approxW = Math.min(520, Math.floor(vw * 0.8));
    const approxH = 360;
    const m = 8;
    setPopupPos({
      x: clamp(Math.round(vw / 2 - approxW / 2), m, Math.max(m, vw - approxW - m)),
      y: clamp(Math.round(vh / 2 - approxH / 2), m, Math.max(m, vh - approxH - m)),
    });
    setOpenId(id);
    setPlaying(false);
  };

  const stopAllAudio = () => {
    const root = rootRef.current;
    if (!root) return;
    root.querySelectorAll("audio").forEach((a) => {
      try { a.pause(); a.currentTime = 0; } catch {}
    });
  };
  const closePopup = () => { stopAllAudio(); setOpenId(null); setPlaying(true); };

  // ===== draggable popup (unchanged feel; just bounds are correct)
  const onDragStart = (x, y) => {
    drag.current.active = true;
    // measure real size for accurate clamping
    const el = popupRef.current;
    if (el) {
      const r = el.getBoundingClientRect();
      drag.current.w = r.width;
      drag.current.h = r.height;
    }
    drag.current.dx = x - popupPos.x;
    drag.current.dy = y - popupPos.y;
    document.body.classList.add("no-select");
  };
  const onDragMove = (x, y) => {
    if (!drag.current.active) return;
    const vw = window.innerWidth, vh = window.innerHeight, m = 8;
    const w = drag.current.w || 520;
    const h = drag.current.h || 360;
    setPopupPos({
      x: clamp(x - drag.current.dx, m, Math.max(m, vw - w - m)),
      y: clamp(y - drag.current.dy, m, Math.max(m, vh - h - m)),
    });
  };
  const onDragEnd = () => { drag.current.active = false; document.body.classList.remove("no-select"); };

  useEffect(() => {
    const up = () => onDragEnd();
    const mv = (e) => onDragMove(e.clientX, e.clientY);
    const tmv = (e) => { const t = e.touches?.[0]; if (t) onDragMove(t.clientX, t.clientY); };
    window.addEventListener("mouseup", up);
    window.addEventListener("mousemove", mv);
    window.addEventListener("touchend", up);
    window.addEventListener("touchmove", tmv, { passive: false });
    return () => {
      window.removeEventListener("mouseup", up);
      window.removeEventListener("mousemove", mv);
      window.removeEventListener("touchend", up);
      window.removeEventListener("touchmove", tmv);
    };
  }, []); // attach once

  // ===== connecting-dots background (keeps your black look)
  useEffect(() => {
    const canvas = canvasRef.current;
    const host = rootRef.current;
    if (!canvas || !host) return;

    const ctx = canvas.getContext("2d");
    const colorDot = "#CECECE";
    const color = "#CECECE";

    let width = 0, height = 0;
    const resizeToHost = () => {
      const r = host.getBoundingClientRect();
      width = canvas.width = Math.max(1, Math.round(r.width));
      height = canvas.height = Math.max(1, Math.round(r.height));
    };
    resizeToHost();

    ctx.fillStyle = colorDot;
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = color;

    const mouse = { x: width / 2, y: height / 2 };

    const dots = { nb: 600, distance: 60, d_radius: 100, array: [] };

    function Dot() {
      this.x = Math.random() * width;
      this.y = Math.random() * height;
      this.vx = -0.5 + Math.random();
      this.vy = -0.5 + Math.random();
      this.radius = Math.random();
    }
    Dot.prototype.create = function () {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2, false);
      ctx.fill();
    };
    Dot.prototype.animate = function () {
      for (let i = 0; i < dots.nb; i++) {
        const d = dots.array[i];
        if (d.y < 0 || d.y > height) d.vy = -d.vy;
        if (d.x < 0 || d.x > width) d.vx = -d.vx;
        d.x += d.vx;
        d.y += d.vy;
      }
    };
    Dot.prototype.line = function () {
      for (let i = 0; i < dots.nb; i++) {
        for (let j = i + 1; j < dots.nb; j++) {
          const di = dots.array[i], dj = dots.array[j];
          const dx = di.x - dj.x, dy = di.y - dj.y;
          if (dx < dots.distance && dy < dots.distance && dx > -dots.distance && dy > -dots.distance) {
            const mx = di.x - mouse.x, my = di.y - mouse.y;
            if (mx < dots.d_radius && my < dots.d_radius && mx > -dots.d_radius && my > -dots.d_radius) {
              ctx.beginPath();
              ctx.moveTo(di.x, di.y);
              ctx.lineTo(dj.x, dj.y);
              ctx.stroke();
              ctx.closePath();
            }
          }
        }
      }
    };

    dots.array = Array.from({ length: dots.nb }, () => new Dot());

    const tick = () => {
      ctx.clearRect(0, 0, width, height);
      for (let i = 0; i < dots.nb; i++) dots.array[i].create();
      Dot.prototype.line();
      Dot.prototype.animate();
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);

    const onMouseMove = (e) => {
      const r = canvas.getBoundingClientRect();
      mouse.x = e.clientX - r.left;
      mouse.y = e.clientY - r.top;
    };
    document.addEventListener("mousemove", onMouseMove, { passive: true });

    let resizeRaf = 0;
    const ro = new ResizeObserver(() => {
      if (resizeRaf) return;
      resizeRaf = requestAnimationFrame(() => {
        resizeRaf = 0;
        resizeToHost();
        dots.array = Array.from({ length: dots.nb }, () => new Dot());
        mouse.x = width / 2; mouse.y = height / 2;
      });
    });
    ro.observe(host);

    return () => {
      cancelAnimationFrame(animRef.current);
      document.removeEventListener("mousemove", onMouseMove);
      ro.disconnect();
    };
  }, []);

  // ===== geometry for slider
  const trackW = slideW * APPS.length;
  const translateX = -(index * slideW);
  const openIdx = APPS.findIndex((a) => a.id === openId);
  const audioSrc = openIdx >= 0 ? audioMap[openIdx + 1] : null;

  // ===== popup portal (so ancestors can’t clip it)
  const popupNode =
    openIdx >= 0
      ? createPortal(
          <div
            ref={popupRef}
            className={`cardslider-popup ${drag.current.active ? "dragging" : ""}`}
            style={{ left: `${popupPos.x}px`, top: `${popupPos.y}px` }}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`popup-title-${APPS[openIdx].id}`}
            onMouseDown={(e) => onDragStart(e.clientX, e.clientY)}
            onTouchStart={(e) => {
              const t = e.touches?.[0];
              if (t) onDragStart(t.clientX, t.clientY);
            }}
          >
            <div className="popup-header">
              <h2 id={`popup-title-${APPS[openIdx].id}`}>{APPS[openIdx].title}</h2>
              <button className="popup-close" onClick={closePopup} aria-label="Close popup">
                Close
              </button>
            </div>

            <p className="popup-body">{APPS[openIdx].body}</p>

            {audioSrc && (
              <div className="popup-audio">
                <AudioPlayer key={APPS[openIdx].id} src={audioSrc} title={`Listen: ${APPS[openIdx].title}`} />
              </div>
            )}
          </div>,
          document.body
        )
      : null;

  return (
    <section ref={rootRef} className="cardslider-root dots-wrap" aria-label="Apps Carousel">
      {/* background canvas behind the cards */}
      <canvas className="connecting-dots" ref={canvasRef} aria-hidden="true" />

      <div className="cardslider-viewport" ref={viewportRef}>
        <button aria-label="Previous" className="nav-btn nav-prev" onClick={prev}>‹</button>
        <button aria-label="Next" className="nav-btn nav-next" onClick={next}>›</button>

        <div
          className="cardslider-track"
          style={{
            width: `${trackW}px`,
            transform: `translateX(${translateX}px)`,
            transition: `transform ${TRANSITION_MS}ms ease`,
          }}
        >
          {APPS.map((app, i) => (
            <article key={app.id} className="card2-item" style={{ width: `${slideW}px` }}>
              <div className="card2 glass">
                <div className="card2-border" aria-hidden="true" />
                <img src={app.img} alt={app.title} />
                <div className="card2-fade" aria-hidden="true" />
                <h3 className="card2-title">{app.title}</h3>
                <p className="card2-desc">{app.body}</p>

                <button
                  className="card2-cta"
                  aria-label={`Open details for ${app.title}`}
                  onClick={() => openPopup(app.id, i)}
                >
                  Learn more
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>

      {/* dots nav */}
      <div className="cardslider-dots" role="tablist" aria-label="Carousel dots">
        {Array.from({ length: Math.max(1, APPS.length - perView + 1) }, (_, i) => (
          <button
            key={i}
            role="tab"
            aria-selected={index === i}
            className={`dot ${index === i ? "active" : ""}`}
            onClick={() => goTo(i)}
            title={`Go to position ${i + 1}`}
          />
        ))}
      </div>

      {/* render popup into body so it's never clipped */}
      {popupNode}
    </section>
  );
}


