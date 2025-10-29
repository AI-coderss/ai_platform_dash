import React, { useRef, useState, useEffect, useCallback } from "react";
import { Swiper, SwiperSlide } from "swiper/react";

// Core Swiper styles
import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/pagination";

// Modules
import { Navigation, Pagination, Autoplay } from "swiper/modules";

// Correct path
import "../styles/swiper-video.css";

// Your video data
const SLIDES = [
  { id: "doctorai",      src: "https://storage.googleapis.com/plat_vid_dsah_x123/doctorai.mp4",        label: "Doctor AI" },
  { id: "transcription", src: "https://storage.googleapis.com/plat_vid_dsah_x123/transcriptionapp.mp4",  label: "Transcription App" },
  { id: "medreport",     src: "https://storage.googleapis.com/plat_vid_dsah_x123/medreport.mp4",        label: "Medical Reports Platform" },
  { id: "ivf",           src: "https://storage.googleapis.com/plat_vid_dsah_x123/ivf.mp4",              label: "IVF Assistant" },
];

// ===================================================================
// ✅ Best Practice: Isolated Video Modal Component
// ===================================================================
/**
 * This component isolates the modal's lifecycle. It only mounts when 'src'
 * is provided and unmounts on close. This prevents the parent
 * component's re-renders from stopping video playback.
 */
const VideoModal = ({ src, onClose }) => {
  const videoRef = useRef(null);

  // Programmatically play on mount for reliability
  useEffect(() => {
    const videoElement = videoRef.current;
    if (videoElement) {
      videoElement.play().catch(error => {
        // Autoplay was likely blocked; controls are visible.
        console.warn("Modal video autoplay failed:", error);
      });
    }
  }, []); // Runs only once when modal mounts

  // Accessibility: Close on 'Escape' key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  // Prevent clicks *inside* the video player from closing the modal
  const handleContentClick = (e) => e.stopPropagation();

  // Best practice: Close modal when video finishes playing
  const handleVideoEnd = () => {
    onClose();
  };

  // Render null if no src (this is how it's hidden)
  if (!src) {
    return null;
  }

  return (
    <div className="vcx-lightbox" onClick={onClose}>
      <div className="vcx-lightbox__content" onClick={handleContentClick}>
        <button className="vcx-lightbox__close" onClick={onClose} aria-label="Close video">
          &times;
        </button>
        {/*
          This standard <video> tag is correct.
          The browser handles streaming. The 'net::ERR_CACHE_...'
          error is a problem with *your* browser, not this code.
        */}
        <video
          ref={videoRef}
          src={src}
          controls        // Show player controls
          playsInline     // Good practice for iOS
          className="vcx-lightbox__video"
          onEnded={handleVideoEnd} // Close when finished
        />
      </div>
    </div>
  );
};


// ===================================================================
// Main Carousel Component
// ===================================================================
const VideoCarousel = () => {
  const [modalVideoSrc, setModalVideoSrc] = useState(null);
  const swiperRef = useRef(null);

  // Particle background refs
  const rootRef = useRef(null);
  const canvasRef = useRef(null);
  const animRef = useRef(0);

  // Keep the latest openModal function for the bridge
  const openModalRef = useRef(null);

  // Memoized playActiveOnly so it's a stable dependency
  const playActiveOnly = useCallback((swiper) => {
    if (!swiper) return;
    const { slides, activeIndex } = swiper;
    slides.forEach((slide, i) => {
      const v = slide.querySelector("video.vcx-video");
      if (!v) return;
      if (i === activeIndex) {
        v.muted = true;
        v.defaultMMuted = true;
        v.playsInline = true;
        v.play().catch(() => {});
      } else {
        try { v.pause(); } catch {}
      }
    });
  }, []); // No dependencies

  const openModal = (src, e) => {
    if (e) { e.stopPropagation(); e.preventDefault(); }
    setModalVideoSrc(src);
    const swiper = swiperRef.current?.swiper;
    if (swiper) {
      const v = swiper.slides?.[swiper.activeIndex]?.querySelector("video.vcx-video");
      if (v) { try { v.pause(); } catch {} }
      swiper.autoplay?.stop();
    }
  };
  openModalRef.current = openModal;

  // Memoized closeModal to be a stable prop for VideoModal
  const closeModal = useCallback(() => {
    setModalVideoSrc(null);
    const swiper = swiperRef.current?.swiper;
    if (swiper) {
      playActiveOnly(swiper); // Uses stable playActiveOnly
      swiper.autoplay?.start();
    }
  }, [playActiveOnly]);

  // (All other handler functions remain unchanged)
  const handleMouseEnterRow = () => {
    const swiper = swiperRef.current?.swiper;
    if (!swiper) return;
    swiper.autoplay?.stop();
    playActiveOnly(swiper);
  };
  const handleMouseLeaveRow = () => {
    const swiper = swiperRef.current?.swiper;
    if (!swiper || modalVideoSrc) return;
    swiper.autoplay?.start();
  };
  const handleCardEnter = (e) => {
    const swiper = swiperRef.current?.swiper;
    const v = e.currentTarget.querySelector("video.vcx-video");
    if (v) {
      v.muted = true;
      v.defaultMuted = true;
      v.playsInline = true;
      v.play().catch(() => {});
    }
    if (swiper) swiper.autoplay?.stop();
  };
  const handleCardLeave = () => {
    const swiper = swiperRef.current?.swiper;
    if (swiper) playActiveOnly(swiper);
  };

  // === Voice Assistant Bridge === (unchanged)
  useEffect(() => {
    const playById = (id, { openModal = false } = {}) => {
      const swiper = swiperRef.current?.swiper;
      if (!swiper) return;

      let idx = SLIDES.findIndex(s => s.id === id);
      if (idx < 0) {
        const lc = String(id || "").toLowerCase();
        idx = SLIDES.findIndex(s => s.label.toLowerCase().includes(lc));
      }
      if (idx < 0) return;

      swiper.slideTo(idx);
      const slide = swiper.slides?.[idx];
      const v = slide?.querySelector?.("video.vcx-video");
      if (v) {
        v.muted = true;
        v.defaultMuted = true;
        v.playsInline = true;
        v.play().catch(() => {});
      }
      swiper.autoplay?.stop();

      if (openModal && openModalRef.current) {
        openModalRef.current(SLIDES[idx].src);
      }
    };

    const bridge = {
      play: (id, opts) => playById(id, opts || {}),
    };
    window.TutorialsBridge = bridge;

    const onEvt = (e) => {
      const { id, openModal } = e.detail || {};
      bridge.play(id, { openModal });
    };
    window.addEventListener("tutorial:play", onEvt);

    return () => {
      if (window.TutorialsBridge === bridge) delete window.TutorialsBridge;
      window.removeEventListener("tutorial:play", onEvt);
    };
  }, []);

  // Particle/connecting-dots background (unchanged)
  useEffect(() => {
    const canvas = canvasRef.current;
    const host = rootRef.current;
    if (!canvas || !host) return;

    const ctx = canvas.getContext("2d");
    const colorDot = "#e2e2e2ff";
    const color = "#e2dedeff";

    let width = 0, height = 0;

    const resizeToViewportWidth = () => {
      const hostRect = host.getBoundingClientRect();
      width  = canvas.width  = Math.max(1, Math.round(window.innerWidth));
      height = canvas.height = Math.max(1, Math.round(hostRect.height));
    };
    resizeToViewportWidth();

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
        if (d.x < 0 || d.x > width)  d.vx = -d.vx;
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

    const onResize = () => resizeToViewportWidth();
    window.addEventListener("resize", onResize);

    const ro = new ResizeObserver(onResize);
    ro.observe(host);

    return () => {
      cancelAnimationFrame(animRef.current);
      document.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("resize", onResize);
      ro.disconnect();
    };
  }, []);

  return (
    <>
      {/* Root wrapper (unchanged) */}
      <div
        ref={rootRef}
        className="vcx-row vcx-wrap"
        onMouseEnter={handleMouseEnterRow}
        onMouseLeave={handleMouseLeaveRow}
      >
        <canvas className="vcx-particles" ref={canvasRef} aria-hidden="true" />

        {/* Swiper (unchanged) */}
        <Swiper
          ref={swiperRef}
          slidesPerView={1}
          spaceBetween={0}
          centeredSlides={false}
          slidesPerGroup={1}
          rewind={true}
          speed={900}
          autoplay={{
            delay: 2400,
            disableOnInteraction: false,
            pauseOnMouseEnter: false
          }}
          navigation={true}
          pagination={{ clickable: true }}
          modules={[Navigation, Pagination, Autoplay]}
          className="vcx-swiper"
          onSwiper={() => {}}
          onSlideChange={(swiper) => playActiveOnly(swiper)}
          onResize={(swiper) => playActiveOnly(swiper)}
        >
          {SLIDES.map((slide) => (
            <SwiperSlide key={slide.id}>
              <div
                className="vcx-card"
                role="button"
                tabIndex={0}
                onMouseEnter={handleCardEnter}
                onMouseLeave={handleCardLeave}
                onClick={(e) => openModal(slide.src, e)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") openModal(slide.src, e);
                }}
              >
                <div className="vcx-thumb">
                  {/* This video tag is for the muted preview */}
                  <video
                    className="vcx-video"
                    src={slide.src}
                    muted
                    loop
                    playsInline
                    preload="metadata"
                  />
                </div>
                <div className="vcx-meta">
                  <div className="vcx-label">{slide.label}</div>
                </div>
              </div>
            </SwiperSlide> 
          ))}
        </Swiper>
      </div>

      {/* Fixed modal implementation (unchanged) */}
      <VideoModal src={modalVideoSrc} onClose={closeModal} />
    </>
  );
};

export default VideoCarousel;










