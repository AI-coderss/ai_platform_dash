import React, { useRef, useState, useEffect } from "react";
import { Swiper, SwiperSlide } from "swiper/react";

// Core Swiper styles (no cube)
import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/pagination";

// Modules
import { Navigation, Pagination, Autoplay } from "swiper/modules";

// ✅ Correct path (double dot)
import "../styles/swiper-video.css";

// Your video data (kept intact)
const SLIDES = [
  { id: "doctorai",      src: "/videos/doctorai.mp4",         label: "Doctor AI" },
  { id: "transcription", src: "/videos/transcriptionapp.mp4", label: "Transcription App" },
  { id: "medreport",     src: "/videos/medreport.mp4",        label: "Medical Reports Platform" },
  { id: "ivf",           src: "/videos/ivf.mp4",              label: "IVF Assistant" },
];

const VideoCarousel = () => {
  const [modalVideoSrc, setModalVideoSrc] = useState(null);
  const swiperRef = useRef(null);

  // Particle background refs
  const rootRef = useRef(null);
  const canvasRef = useRef(null);
  const animRef = useRef(0);

  // Play only the active slide's video; pause others
  const playActiveOnly = (swiper) => {
    if (!swiper) return;
    const { slides, activeIndex } = swiper;
    slides.forEach((slide, i) => {
      const v = slide.querySelector("video.vcx-video");
      if (!v) return;
      if (i === activeIndex) {
        v.muted = true;
        v.playsInline = true;
        v.play().catch(() => {});
      } else {
        try { v.pause(); } catch {}
      }
    });
  };

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

  const closeModal = () => {
    setModalVideoSrc(null);
    const swiper = swiperRef.current?.swiper;
    if (swiper) {
      playActiveOnly(swiper);
      swiper.autoplay?.start();
    }
  };

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
      v.playsInline = true;
      v.play().catch(() => {});
    }
    if (swiper) swiper.autoplay?.stop();
  };
  const handleCardLeave = () => {
    const swiper = swiperRef.current?.swiper;
    if (swiper) playActiveOnly(swiper);
  };

  // Particle/connecting-dots background
  useEffect(() => {
    const canvas = canvasRef.current;
    const host = rootRef.current;
    if (!canvas || !host) return;

    const ctx = canvas.getContext("2d");
    const colorDot = "#e2e2e2ff";
    const color = "#e2dedeff";

    let width = 0, height = 0;
    const resizeToHost = () => {
      const r = host.getBoundingClientRect();
      width = (canvas.width = Math.max(1, Math.round(r.width)));
      height = (canvas.height = Math.max(1, Math.round(r.height)));
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

  return (
    <>
      {/* Root wrapper with particles */}
      <div
        ref={rootRef}
        className="vcx-row vcx-wrap"
        onMouseEnter={handleMouseEnterRow}
        onMouseLeave={handleMouseLeaveRow}
      >
        {/* Particle canvas behind the carousel */}
        <canvas className="vcx-particles" ref={canvasRef} aria-hidden="true" />

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
          onSwiper={(swiper) => playActiveOnly(swiper)}
          onSlideChange={(swiper) => playActiveOnly(swiper)}
          onResize={(swiper) => playActiveOnly(swiper)}
        >
          {SLIDES.map((slide) => (
            <SwiperSlide key={slide.id}>
              {/* Entire card is clickable */}
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

      {modalVideoSrc && (
        <div className="vcx-lightbox" onClick={closeModal}>
          <div className="vcx-lightbox__content" onClick={(e) => e.stopPropagation()}>
            <button className="vcx-lightbox__close" onClick={closeModal} aria-label="Close video">
              &times;
            </button>
            <video src={modalVideoSrc} controls autoPlay className="vcx-lightbox__video" />
          </div>
        </div>
      )}
    </>
  );
};

export default VideoCarousel;







