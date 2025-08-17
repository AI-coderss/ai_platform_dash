/* eslint-disable jsx-a11y/anchor-is-valid */
/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable react-hooks/exhaustive-deps */
import React, { useEffect, useRef, useState } from "react";
import "../styles/CardScroll.css";
import AudioPlayer from "./AudioPlayer";

/** 🔊 Audio sources (1-based keys match card order) */
const audioMap = {
  1: "/assets/audio/ai_doctor.mp3",
  2: "/assets/audio/medical_transcription.mp3",
  3: "/assets/audio/data_analyst.mp3",
  4: "/assets/audio/report_enhancement.mp3",
  5: "/assets/audio/ivf_assistant.mp3",
  6: "/assets/audio/patient_assistant.mp3",
};

/** Cards content */
const APPS = [
  {
    id: "ai_doctor",
    title: "Patient Voice Assistant",
    img: "https://iili.io/3QhqLmP.jpg",
    popupTitle: "Patient Voice Assistant",
    popupBody:
      "Natural, multilingual triage and directions in real time. Books appointments, answers FAQs, and hands off to agents when needed—directly on the hospital site.",
  },
  {
    id: "transcription",
    title: "Medical Transcription",
    img: "https://iili.io/3Qhqi7V.jpg",
    popupTitle: "Medical Transcription & Report Writer",
    popupBody:
      "Whisper-powered dictation with AI grammar/structure. Doctors edit inline; one-click export to HIS with audit trails for quality.",
  },
  {
    id: "bi_dashboard",
    title: "AI BI Dashboard",
    img: "https://iili.io/3QhqskB.jpg",
    popupTitle: "AI BI Dashboard",
    popupBody:
      "KPIs for clinics, labs, and finance with drilldowns, trend alerts, and smart commentary to accelerate data-driven decisions.",
  },
  {
    id: "report_enhance",
    title: "Report Enhancement",
    img: "https://iili.io/3QhqthF.jpg",
    popupTitle: "Report Enhancement",
    popupBody:
      "Real-time suggestions for clarity, consistency, and medical terminology—standardizing clinical communication across departments.",
  },
  {
    id: "ivf_assistant",
    title: "IVF Training Assistant",
    img: "https://iili.io/3Qhqyrv.jpg",
    popupTitle: "IVF Virtual Training Assistant",
    popupBody:
      "Interactive protocols, image-guided checklists, and instant Q&A grounded in your training manual to standardize best practices.",
  },
  {
    id: "patient_avatar",
    title: "Patient Avatar",
    img: "https://iili.io/3QhqmBa.jpg",
    popupTitle: "Patient Assistant Avatar",
    popupBody:
      "Low-latency speech-to-speech with an animated 3D avatar. Streams text + audio for immersive patient engagement.",
  },
];

/** Auto-rotate speed — lively (not too slow) */
const ROTATE_MS = 1800;

function CardScroll() {
  const rootRef = useRef(null);
  const bgCanvasRef = useRef(null);
  const carouselRef = useRef(null);

  const [currentIdx, setCurrentIdx] = useState(0);
  const [rotationInterval, setRotationInterval] = useState(null);
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const [openPopupId, setOpenPopupId] = useState(null);

  // Responsive geometry
  const getResponsiveSettings = () => {
    const width = window.innerWidth;
    if (width <= 400) return { rotationStep: 45, radius: 160 };
    if (width <= 600) return { rotationStep: 50, radius: 200 };
    if (width <= 768) return { rotationStep: 60, radius: 260 };
    return { rotationStep: 72, radius: 350 };
  };

  // 3D ring positions (compose transform with a CSS variable for scale)
  const setCardPositions = () => {
    const root = carouselRef.current;
    if (!root) return;
    const cards = root.querySelectorAll(".card2");
    const { rotationStep, radius } = getResponsiveSettings();

    cards.forEach((card, i) => {
      const rotateY = i * rotationStep;
      const angleRad = (rotateY * Math.PI) / 180;
      const x = Math.sin(angleRad) * radius;
      const z = Math.cos(angleRad) * radius;
      // include scale via CSS variable so hover can override
      card.style.transform = `translateX(${x}px) translateZ(${z}px) rotateY(${rotateY}deg) scale(var(--scale, 1))`;
    });

    updateCardSize();
    rotateCarousel();
  };

  // front card enlarged via CSS variable; others back to 1
  const updateCardSize = () => {
    const root = carouselRef.current;
    if (!root) return;
    const cards = root.querySelectorAll(".card2");
    cards.forEach((card, i) => {
      card.style.setProperty("--scale", i === currentIdx ? "1.2" : "1");
      card.style.zIndex = i === currentIdx ? "1" : "0";
    });
  };

  const rotateCarousel = () => {
    const root = carouselRef.current;
    if (!root) return;
    const { rotationStep } = getResponsiveSettings();
    const rotateDeg = -rotationStep * currentIdx;
    root.style.transform = `rotateY(${rotateDeg}deg)`;
  };

  // Auto-rotation
  const startRotation = () => {
    if (rotationInterval || isPopupOpen) return;
    const id = window.setInterval(() => {
      setCurrentIdx((prev) => (prev + 1) % APPS.length);
    }, ROTATE_MS);
    setRotationInterval(id);
  };
  const stopRotation = () => {
    if (rotationInterval) {
      window.clearInterval(rotationInterval);
      setRotationInterval(null);
    }
  };

  // Popups
  const showPopup = (id) => {
    setOpenPopupId(id);
    setIsPopupOpen(true);
    stopRotation();
  };

  const pauseAllAudioInRoot = () => {
    const rootEl = rootRef.current;
    if (!rootEl) return;
    const audios = rootEl.querySelectorAll("audio");
    audios.forEach((a) => {
      try {
        a.pause();
        a.currentTime = 0;
      } catch (_) {}
    });
  };

  const closePopup = () => {
    pauseAllAudioInRoot(); // stop any playback
    setOpenPopupId(null);  // unmount popup
    setIsPopupOpen(false);
    startRotation();
  };

  // Clicking a card opens its popup
  const onCardClick = (id, index) => {
    setCurrentIdx(index);
    setTimeout(() => showPopup(id), 200);
  };

  // Init positions + rotation
  useEffect(() => {
    setCardPositions();
    startRotation();
    const onResize = () => setCardPositions();
    window.addEventListener("resize", onResize);
    return () => {
      stopRotation();
      window.removeEventListener("resize", onResize);
    };
  }, []);

  // On index change
  useEffect(() => {
    rotateCarousel();
    updateCardSize();
  }, [currentIdx]);

  // Pause on hover/touch
  useEffect(() => {
    const root = carouselRef.current;
    if (!root) return;

    const handleOver = () => {
      if (!isPopupOpen) stopRotation();
    };
    const handleOut = () => {
      if (!isPopupOpen) startRotation();
    };

    root.addEventListener("mouseover", handleOver);
    root.addEventListener("mouseout", handleOut);
    root.addEventListener("touchstart", handleOver, { passive: true });
    root.addEventListener("touchend", handleOut, { passive: true });

    return () => {
      root.removeEventListener("mouseover", handleOver);
      root.removeEventListener("mouseout", handleOut);
      root.removeEventListener("touchstart", handleOver);
      root.removeEventListener("touchend", handleOut);
    };
  }, [isPopupOpen, rotationInterval]);

  /** Theme-aware background particles */
  useEffect(() => {
    const canvas = bgCanvasRef.current;
    const ctx = canvas.getContext("2d");
    let width, height, raf;
    let dots = [];
    let t = 0;

    const getVar = (name, fallback) =>
      getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

    const init = () => {
      width = canvas.width = canvas.offsetWidth;
      height = canvas.height = canvas.offsetHeight;
      const count = Math.max(24, Math.floor((width * height) / 50000));
      dots = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        r: Math.random() * 1.6 + 0.6,
        vx: (Math.random() - 0.5) * 0.25,
        vy: (Math.random() - 0.5) * 0.25,
        p: Math.random() * Math.PI * 2,
      }));
    };

    const draw = () => {
      t += 0.5;
      ctx.clearRect(0, 0, width, height);

      // faint grid
      ctx.globalAlpha = 0.05;
      ctx.beginPath();
      for (let x = 0; x < width; x += 48) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
      }
      for (let y = 0; y < height; y += 48) {
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
      }
      ctx.strokeStyle = getVar("--grid-line", "rgba(6,182,212,0.05)");
      ctx.stroke();
      ctx.globalAlpha = 1;

      const primary = getVar("--brand-primary", "#4f46e5");
      const accent = getVar("--brand-accent", "#06b6d4");

      // dots
      dots.forEach((d) => {
        d.x += d.vx;
        d.y += d.vy;
        if (d.x < 0 || d.x > width) d.vx *= -1;
        if (d.y < 0 || d.y > height) d.vy *= -1;

        const tw = 0.6 + 0.4 * Math.sin(d.p + t * 0.02);
        ctx.globalAlpha = tw;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fillStyle = Math.random() > 0.5 ? primary : accent;
        ctx.fill();
      });

      raf = requestAnimationFrame(draw);
    };

    let resizeTO;
    const onResize = () => {
      clearTimeout(resizeTO);
      resizeTO = setTimeout(() => init(), 120);
    };

    init();
    draw();
    window.addEventListener("resize", onResize);

    // re-init on theme change
    const observer = new MutationObserver((m) => {
      if (m.some((x) => x.attributeName === "data-theme")) init();
    });
    observer.observe(document.documentElement, { attributes: true });

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      observer.disconnect();
    };
  }, []);

  // Only render the ONE open popup (unmount on close to stop audio)
  const openIndex = APPS.findIndex((a) => a.id === openPopupId);
  const openApp = openIndex >= 0 ? APPS[openIndex] : null;
  const openAudioSrc = openIndex >= 0 ? audioMap[openIndex + 1] : null;

  return (
    <section
      ref={rootRef}
      className="cardscroll-root"
      aria-label="Apps Carousel"
    >
      {/* theme-aware particle backdrop */}
      <canvas ref={bgCanvasRef} className="cardscroll-bg" aria-hidden="true" />

      <div className="scene">
        <div className="carousel" id="carousel" ref={carouselRef}>
          {APPS.map((app, i) => (
            <div
              key={app.id}
              className="card2"
              data-id={app.id}
              onClick={() => onCardClick(app.id, i)}
            >
              <img src={app.img} alt={app.title} />
              <h3>{app.title}</h3>
              {/* soft bottom gradient for title legibility */}
              <span className="card2-fade" aria-hidden="true" />
            </div>
          ))}
        </div>
      </div>

      {openApp && (
        <div
          id={`popup-${openApp.id}`}
          className="popup show"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`popup-title-${openApp.id}`}
        >
          <h2 id={`popup-title-${openApp.id}`}>{openApp.popupTitle}</h2>
          <p className="popup-body">{openApp.popupBody}</p>

          {openAudioSrc && (
            <div className="popup-audio">
              <AudioPlayer
                key={openApp.id}
                src={openAudioSrc}
                title={`Listen: ${openApp.popupTitle}`}
              />
            </div>
          )}

          <button className="popup-close" onClick={closePopup}>
            Close
          </button>
        </div>
      )}
    </section>
  );
}

export default CardScroll;
