/* eslint-disable no-unused-vars */
/* eslint-disable react-hooks/exhaustive-deps */
import React, { useEffect, useRef, useState, useCallback } from "react";
import "../styles/VideoCarousel.css";

const DEFAULT_VIDEOS = [
  { id: "doctorai",      src: "https://storage.googleapis.com/plat_vid_dsah_x123/doctorai.mp4",        label: "Doctor AI" },
  { id: "transcription", src: "https://storage.googleapis.com/plat_vid_dsah_x123/transcriptionapp.mp4", label: "Transcription App" },
  { id: "medreport",     src: "https://storage.googleapis.com/plat_vid_dsah_x123/medreport.mp4",        label: "Medical Reports Platform" },
  { id: "ivf",           src: "https://storage.googleapis.com/plat_vid_dsah_x123/ivf.mp4",              label: "IVF Assistant" },
];

export default function VideoCarousel({ videos = DEFAULT_VIDEOS }) {
  const [index, setIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [userStarted, setUserStarted] = useState(false); // user clicked play at least once
  const videoRef = useRef(null);
  const swapTokenRef = useRef(0); // prevents races during rapid switches

  const currentVideo = videos[index];

  /* ---------------- core: safe source swap (no “play() interrupted” warnings) --------------- */
  const setSourceSafely = useCallback(async (el, newSrc, resume) => {
    const token = ++swapTokenRef.current;

    // 1) Pause first to avoid “play() interrupted because load() was called”
    try { await el.pause(); } catch {}

    // 2) Let pause settle in the event loop
    await new Promise((r) => requestAnimationFrame(r));
    if (token !== swapTokenRef.current) return;

    // 3) Change src only if different
    if (el.src !== newSrc) {
      el.src = newSrc;
      el.load();
    }

    // 4) Wait for playable data before attempting resume
    await new Promise((resolve) => {
      if (el.readyState >= 2) return resolve(); // HAVE_CURRENT_DATA+
      const onReady = () => {
        el.removeEventListener("loadeddata", onReady);
        el.removeEventListener("canplay", onReady);
        resolve();
      };
      el.addEventListener("loadeddata", onReady, { once: true });
      el.addEventListener("canplay", onReady, { once: true });
    });

    if (token !== swapTokenRef.current) return;

    // 5) Resume only if requested
    if (resume) {
      el.play().catch(() => {
        // If blocked by autoplay policy, we just keep overlay visible
      });
    }
  }, []);

  const changeVideo = useCallback((newIndex) => {
    const el = videoRef.current;
    if (!el) return;

    const wasPlaying = !el.paused && !el.ended;
    const shouldResume = userStarted && wasPlaying;

    setSourceSafely(el, videos[newIndex].src, shouldResume);
    setIndex(newIndex);

    if (!shouldResume) setIsPlaying(false); // ensure overlay shows when not resuming
  }, [setSourceSafely, userStarted, videos]);

  const nextVideo = () => changeVideo((index + 1) % videos.length);
  const prevVideo = () => changeVideo((index - 1 + videos.length) % videos.length);

  const handleOverlayPlay = async () => {
    const el = videoRef.current;
    if (!el) return;
    setUserStarted(true);
    try { await el.play(); } catch { /* keep overlay visible if blocked */ }
  };

  /* ----------------------------------- events ----------------------------------- */
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

  /* --------------------------- function-calling bridge --------------------------- *
   * Control from a voice agent or elsewhere:
   *   window.TutorialsBridge.play("doctorai" | "Doctor AI")
   *   window.TutorialsBridge.pause()
   *   window.TutorialsBridge.next()
   *   window.TutorialsBridge.prev()
   *   window.TutorialsBridge.seek(seconds)       // relative +/- seconds
   *   window.TutorialsBridge.volume(value01)     // 0..1
   * Also listens to a DOM event:
   *   window.dispatchEvent(new CustomEvent("tutorial:play", { detail: { id: "doctorai" } }))
   */
  useEffect(() => {
    const el = videoRef.current;

    const findIndexByIdOrLabel = (needle) => {
      if (needle == null) return -1;
      const lc = String(needle).toLowerCase();
      let idx = videos.findIndex(v => v.id.toLowerCase() === lc);
      if (idx >= 0) return idx;
      idx = videos.findIndex(v => v.label.toLowerCase().includes(lc));
      return idx;
    };

    const bridge = {
      play: (idOrLabel, opts = {}) => {
        const idx = findIndexByIdOrLabel(idOrLabel);
        if (idx < 0) return;
        setUserStarted(true);                 // allow resume behavior
        changeVideo(idx);                     // switch
        // try to play (if autoplay blocks, overlay remains)
        const vid = videoRef.current;
        if (vid) vid.play().catch(() => {});
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
      }
    };

    // expose bridge
    window.TutorialsBridge = bridge;

    // optional event alias like your original
    const onEvt = (e) => {
      const { id } = (e && e.detail) || {};
      if (id != null) bridge.play(id);
    };
    window.addEventListener("tutorial:play", onEvt);

    return () => {
      // clean up only if we are the current bridge
      if (window.TutorialsBridge === bridge) delete window.TutorialsBridge;
      window.removeEventListener("tutorial:play", onEvt);
    };
  }, [videos, changeVideo, nextVideo, prevVideo]);

  return (
    <div className={`vc-root ${isPlaying ? "is-playing" : ""}`}>
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
          {!isPlaying && (
            <button className="vc-overlay-play" onClick={handleOverlayPlay} aria-label="Play">
              <svg viewBox="0 0 80 80" aria-hidden="true">
                <path d="M40 0a40 40 0 1040 40A40 40 0 0040 0zM26 61.56V18.44L64 40z" />
              </svg>
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










