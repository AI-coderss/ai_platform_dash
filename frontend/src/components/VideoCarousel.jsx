import React, { useEffect, useRef, useState, useCallback } from "react";
import "../styles/VideoCarousel.css";

const DEFAULT_VIDEOS = [
  { id: "doctorai",      src: "https://storage.googleapis.com/plat_vid_dsah_x123/doctorai.mp4",       label: "Doctor AI" },
  { id: "transcription", src: "https://storage.googleapis.com/plat_vid_dsah_x123/transcriptionapp.mp4", label: "Transcription App" },
  { id: "medreport",     src: "https://storage.googleapis.com/plat_vid_dsah_x123/medreport.mp4",       label: "Medical Reports Platform" },
  { id: "ivf",           src: "https://storage.googleapis.com/plat_vid_dsah_x123/ivf.mp4",              label: "IVF Assistant" },
];

export default function VideoCarousel({ videos = DEFAULT_VIDEOS }) {
  const [index, setIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [userStarted, setUserStarted] = useState(false); // user explicitly clicked play at least once
  const videoRef = useRef(null);
  const swapTokenRef = useRef(0); // prevents races during rapid switches

  const currentVideo = videos[index];

  // ---- core: safe source swap without autoplay glitches / interruption errors
  const setSourceSafely = useCallback(async (el, newSrc, resume) => {
    const token = ++swapTokenRef.current;

    // 1) Pause first to avoid "play() interrupted" when we call load()
    try { await el.pause(); } catch {}

    // 2) Allow pause to settle in the event loop
    await new Promise((r) => requestAnimationFrame(r));
    if (token !== swapTokenRef.current) return;

    // 3) Only change when different (prevents needless reloads)
    if (el.src !== newSrc) {
      el.src = newSrc;
      el.load();
    }

    // 4) Wait for ready state before resuming (prevents “interrupted”)
    await new Promise((resolve) => {
      if (el.readyState >= 2) return resolve(); // HAVE_CURRENT_DATA+
      const onCanPlay = () => {
        el.removeEventListener("loadeddata", onCanPlay);
        el.removeEventListener("canplay", onCanPlay);
        resolve();
      };
      el.addEventListener("loadeddata", onCanPlay, { once: true });
      el.addEventListener("canplay", onCanPlay, { once: true });
    });

    if (token !== swapTokenRef.current) return;

    // 5) Resume only if caller asked us to (i.e., user was playing)
    if (resume) {
      el.play().catch(() => {
        // If play is blocked, keep overlay visible; no throw.
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

    if (!shouldResume) setIsPlaying(false); // show overlay if not resuming
  }, [setSourceSafely, userStarted, videos]);

  const nextVideo  = () => changeVideo((index + 1) % videos.length);
  const prevVideo  = () => changeVideo((index - 1 + videos.length) % videos.length);

  const handleOverlayPlay = async () => {
    const el = videoRef.current;
    if (!el) return;
    setUserStarted(true);
    try { await el.play(); } catch {}
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

  return (
    <div className={`vc-root ${isPlaying ? "is-playing" : ""}`}>
      <div className="vc-player">
        <button className="vc-nav prev" onClick={prevVideo} aria-label="Previous">‹</button>

        <div className="vc-video-wrap">
          <video
            ref={videoRef}
            className="vc-video"
            src={currentVideo.src}
            preload="metadata"      // light but reliable; you can switch to "auto" if desired
            playsInline
            // no controls until playing; the overlay is the trigger
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










