/* eslint-disable no-unused-vars */
/* eslint-disable react-hooks/exhaustive-deps */
import React, { useEffect, useRef, useState, useCallback } from "react";
import "../styles/VideoCarousel.css";

const DEFAULT_VIDEOS = [
  { id: "doctorai",      src: "https://storage.googleapis.com/plat_vid_dsah_x123/doctorai.mp4",        label: "Doctor AI" },
  { id: "transcription", src: "https://storage.googleapis.com/plat_vid_dsah_x123/medicaltranscriptionv2.mp4", label: "Transcription App" },
  { id: "medreport",     src: "https://storage.googleapis.com/plat_vid_dsah_x123/medreport.mp4",        label: "Medical Reports Platform" },
  { id: "ivf",           src: "https://storage.googleapis.com/plat_vid_dsah_x123/ivf.mp4",              label: "IVF Assistant" },
];

export default function VideoCarousel({ videos = DEFAULT_VIDEOS }) {
  const [index, setIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [userStarted, setUserStarted] = useState(false);
  const [isClosed, setIsClosed] = useState(false); // 👈 NEW
  const videoRef = useRef(null);
  const swapTokenRef = useRef(0);

  const currentVideo = videos[index];

  const setSourceSafely = useCallback(async (el, newSrc, resume) => {
    const token = ++swapTokenRef.current;
    try { await el.pause(); } catch {}
    await new Promise((r) => requestAnimationFrame(r));
    if (token !== swapTokenRef.current) return;

    if (el.src !== newSrc) {
      el.src = newSrc;
      el.load();
    }

    await new Promise((resolve) => {
      if (el.readyState >= 2) return resolve();
      const onReady = () => {
        el.removeEventListener("loadeddata", onReady);
        el.removeEventListener("canplay", onReady);
        resolve();
      };
      el.addEventListener("loadeddata", onReady, { once: true });
      el.addEventListener("canplay", onReady, { once: true });
    });

    if (token !== swapTokenRef.current) return;

    if (resume) {
      el.play().catch(() => {});
    }
  }, []);

  const changeVideo = useCallback((newIndex) => {
    const el = videoRef.current;
    if (!el) return;

    const wasPlaying = !el.paused && !el.ended;
    const shouldResume = userStarted && wasPlaying;

    setSourceSafely(el, videos[newIndex].src, shouldResume);
    setIndex(newIndex);

    if (!shouldResume) setIsPlaying(false);
    // if it was closed before, reopen when user selects a video
    setIsClosed(false);
  }, [setSourceSafely, userStarted, videos]);

  const nextVideo = () => changeVideo((index + 1) % videos.length);
  const prevVideo = () => changeVideo((index - 1 + videos.length) % videos.length);

  const handleOverlayPlay = async () => {
    const el = videoRef.current;
    if (!el) return;
    setUserStarted(true);
    setIsClosed(false); // in case closed before
    try { await el.play(); } catch {}
  };

  // 👇 NEW: close handler
  const handleClose = () => {
    const el = videoRef.current;
    if (el) {
      try {
        el.pause();
        el.currentTime = 0; // reset
      } catch {}
    }
    setIsPlaying(false);
    setIsClosed(true); // hide overlay controls
  };

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    const onPlay  = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => setIsPlaying(false);

    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("ended", onEnded);
    return () => {
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("ended", onEnded);
    };
  }, []);

  // bridge (kept exactly, just add close)
  useEffect(() => {
    const findIndexByIdOrLabel = (needle) => {
      if (needle == null) return -1;
      const lc = String(needle).toLowerCase();
      let idx = videos.findIndex(v => v.id.toLowerCase() === lc);
      if (idx >= 0) return idx;
      idx = videos.findIndex(v => v.label.toLowerCase().includes(lc));
      return idx;
    };

    const bridge = {
      play: (idOrLabel) => {
        const idx = findIndexByIdOrLabel(idOrLabel);
        if (idx < 0) return;
        setUserStarted(true);
        changeVideo(idx);
        const vid = videoRef.current;
        if (vid) vid.play().catch(() => {});
        setIsClosed(false);
      },
      pause: () => {
        const vid = videoRef.current;
        if (vid) { try { vid.pause(); } catch {} }
      },
      next: () => nextVideo(),
      prev: () => prevVideo(),
      seek: (deltaSeconds = 0) => {
        const vid = videoRef.current;
        if (!vid || Number.isNaN(deltaSeconds)) return;
        try {
          const t = Math.max(0, Math.min((vid.currentTime || 0) + deltaSeconds, vid.duration || 1e9));
          vid.currentTime = t;
        } catch {}
      },
      volume: (val01) => {
        const vid = videoRef.current;
        if (!vid) return;
        const v = Math.max(0, Math.min(1, Number(val01)));
        if (!Number.isNaN(v)) vid.volume = v;
      },
      // 👇 NEW: allow agent to close it
      close: () => handleClose(),
    };

    window.TutorialsBridge = bridge;

    const onEvt = (e) => {
      const { id } = (e && e.detail) || {};
      if (id != null) bridge.play(id);
    };
    window.addEventListener("tutorial:play", onEvt);

    return () => {
      if (window.TutorialsBridge === bridge) delete window.TutorialsBridge;
      window.removeEventListener("tutorial:play", onEvt);
    };
  }, [videos, changeVideo, nextVideo, prevVideo]);

  return (
    <div className={`vc-root ${isPlaying ? "is-playing" : ""} ${isClosed ? "is-closed" : ""}`}>
      <div className="vc-player">
        <button className="vc-nav prev" onClick={prevVideo} aria-label="Previous">‹</button>

        <div className="vc-video-wrap">
          <video
            ref={videoRef}
            className="vc-video"
            src={currentVideo.src}
            preload="metadata"
            playsInline
          />
          {/* Play overlay — only when not closed and not playing */}
          {!isPlaying && !isClosed && (
            <button className="vc-overlay-play" onClick={handleOverlayPlay} aria-label="Play">
              <svg viewBox="0 0 80 80" aria-hidden="true">
                <path d="M40 0a40 40 0 1040 40A40 40 0 0040 0zM26 61.56V18.44L64 40z" />
              </svg>
            </button>
          )}

          {/* 👇 NEW CLOSE BUTTON */}
          {!isClosed && (
            <button className="vc-close" onClick={handleClose} aria-label="Close">
              ✕
            </button>
          )}
        </div>

        <button className="vc-nav next" onClick={nextVideo} aria-label="Next">›</button>
      </div>

      <div className="vc-labels">
        {videos.map((v, i) => (
          <button
            key={v.id}
            className={`vc-chip ${i === index ? "active" : ""}`}
            onClick={() => changeVideo(i)}
            title={v.label}
          >
            {v.label}
          </button>
        ))}
      </div>
    </div>
  );
}











