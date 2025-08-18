/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable react-hooks/exhaustive-deps */
import React, { useEffect, useRef, useState } from "react";
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
    title: "Patient Voice Assistant",
    img: "https://iili.io/3QhqLmP.jpg",
    body:
      "Natural, multilingual triage and directions in real time. Books appointments, answers FAQs, and hands off to agents when needed.",
  },
  {
    id: "transcription",
    title: "Medical Transcription",
    img: "https://iili.io/3Qhqi7V.jpg",
    body:
      "Whisper-powered dictation with AI grammar/structure. Edit inline and export to HIS with audit trail.",
  },
  {
    id: "bi_dashboard",
    title: "AI BI Dashboard",
    img: "https://iili.io/3QhqskB.jpg",
    body:
      "KPIs for clinics, labs, and finance. Drilldowns, trend alerts, and smart commentary out of the box.",
  },
  {
    id: "report_enhance",
    title: "Report Enhancement",
    img: "https://iili.io/3QhqthF.jpg",
    body:
      "Real-time suggestions for clarity and medical terminology to standardize clinical communication.",
  },
  {
    id: "ivf_assistant",
    title: "IVF Training Assistant",
    img: "https://iili.io/3Qhqyrv.jpg",
    body:
      "Interactive protocols, image-guided checklists, and instant Q&A grounded in your training manual.",
  },
  {
    id: "patient_avatar",
    title: "Patient Assistant Avatar",
    img: "https://iili.io/3QhqmBa.jpg",
    body:
      "Low-latency speech-to-speech with a 3D avatar. Streams text + audio for immersive patient engagement.",
  },
];

const AUTOPLAY_MS = 2600;
const TRANSITION_MS = 520;

export default function CardCarousel() {
  const rootRef = useRef(null);
  const viewportRef = useRef(null);

  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [openId, setOpenId] = useState(null);

  const [perView, setPerView] = useState(3);
  const [slideW, setSlideW] = useState(360); // px fallback

  // draggable popup
  const [popupPos, setPopupPos] = useState({ x: 0, y: 0 });
  const drag = useRef({ active: false, dx: 0, dy: 0 });

  // measure & respond to resize (and on mount)
  useEffect(() => {
    const compute = () => {
      const vp = viewportRef.current;
      if (!vp) return;

      const w = vp.clientWidth;
      const pv = w <= 640 ? 1 : w <= 1024 ? 2 : 3;
      setPerView(pv);

      const pad = 72; // 36px left + 36px right arrow padding (matches CSS)
      const usable = Math.max(280, w - pad); // prevent tiny widths
      const slideWidth = Math.floor(usable / pv);
      setSlideW(slideWidth);

      // clamp index so we never scroll past end
      const maxStart = Math.max(0, APPS.length - pv);
      setIndex((prev) => Math.min(prev, maxStart));
    };

    compute();
    const ro = new ResizeObserver(compute);
    if (viewportRef.current) ro.observe(viewportRef.current);
    window.addEventListener("orientationchange", compute);
    return () => {
      ro.disconnect();
      window.removeEventListener("orientationchange", compute);
    };
  }, []);

  // autoplay
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

  // hover/touch pause
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

  // navigation
  const maxStart = Math.max(0, APPS.length - perView);
  const prev = () => setIndex((v) => Math.max(0, v - 1));
  const next = () => setIndex((v) => (v >= maxStart ? 0 : v + 1));
  const goTo = (i) => setIndex(i);

  // popup
  const openPopup = (id, i) => {
    setIndex(Math.min(i, maxStart));
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    setPopupPos({ x: Math.max(12, vw / 2 - 260), y: Math.max(12, vh / 2 - 200) });
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

  const closePopup = () => {
    stopAllAudio();
    setOpenId(null);
    setPlaying(true);
  };

  // draggable popup
  const onDragStart = (x, y) => {
    drag.current.active = true;
    drag.current.dx = x - popupPos.x;
    drag.current.dy = y - popupPos.y;
    document.body.classList.add("no-select");
  };
  const onDragMove = (x, y) => {
    if (!drag.current.active) return;
    const vw = window.innerWidth, vh = window.innerHeight, m = 8;
    setPopupPos({
      x: Math.min(Math.max(m, x - drag.current.dx), vw - m),
      y: Math.min(Math.max(m, y - drag.current.dy), vh - m),
    });
  };
  const onDragEnd = () => {
    drag.current.active = false;
    document.body.classList.remove("no-select");
  };

  useEffect(() => {
    const up = () => onDragEnd();
    const mv = (e) => onDragMove(e.clientX, e.clientY);
    const tmv = (e) => {
      const t = e.touches?.[0];
      if (t) onDragMove(t.clientX, t.clientY);
    };
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
  }, [popupPos]);

  // track geometry
  const trackW = slideW * APPS.length;           // px
  const translateX = -(index * slideW);          // px
  const openIdx = APPS.findIndex((a) => a.id === openId);
  const audioSrc = openIdx >= 0 ? audioMap[openIdx + 1] : null;

  return (
    <section ref={rootRef} className="cardslider-root" aria-label="Apps Carousel">
      <div className="cardslider-viewport" ref={viewportRef}>
        <button aria-label="Previous" className="nav-btn nav-prev" onClick={prev}>‹</button>
        <button aria-label="Next" className="nav-btn nav-next" onClick={next}>›</button>

        {/* The key fix: track has explicit width and the container reserves height via CSS variables */}
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

      {/* dots */}
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

      {/* Draggable glass popup */}
      {openIdx >= 0 && (
        <div
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
        </div>
      )}
    </section>
  );
}
