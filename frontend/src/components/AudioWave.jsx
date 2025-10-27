/* eslint-disable no-unused-vars */
import React, { useEffect, useRef } from "react";
import "../styles/AudioWave.css";

/**
 * Props:
 *  - stream?: MediaStream
 *  - audioUrl?: string
 *  - onEnded?: () => void
 *  - boost?: number       (subtle vertical exaggeration; default 1.1)
 *  - height?: number      (CSS pixel height; default 56)
 *  - smoothness?: number  (0..1, higher = smoother; default 0.9)
 */
const AudioWave = ({
  stream,
  audioUrl,
  onEnded,
  boost = 1.1,
  height = 56,
  smoothness = 0.9,
}) => {
  const canvasRef = useRef(null);

  const audioRef = useRef(null);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const gainSilentRef = useRef(null);
  const sourceRef = useRef(null);
  const rafRef = useRef(null);
  const resizeObsRef = useRef(null);
  const smoothLevelRef = useRef(0.0);

  const cleanupAudio = () => {
    cancelAnimationFrame(rafRef.current || 0);
    rafRef.current = null;

    try { analyserRef.current?.disconnect(); } catch {}
    try { gainSilentRef.current?.disconnect(); } catch {}
    try { sourceRef.current?.disconnect(); } catch {}

    analyserRef.current = null;
    gainSilentRef.current = null;
    sourceRef.current = null;

    if (audioRef.current) {
      try { audioRef.current.pause(); } catch {}
      audioRef.current.src = "";
      audioRef.current = null;
    }
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      audioCtxRef.current.close().catch(() => {});
    }
    audioCtxRef.current = null;
  };

  const ensureAudioContext = async () => {
    if (audioCtxRef.current) return audioCtxRef.current;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    audioCtxRef.current = ctx;
    if (ctx.state === "suspended") {
      try { await ctx.resume(); } catch {}
    }
    return ctx;
  };

  const resumeOnGestureOnce = () => {
    const resume = async () => {
      if (audioCtxRef.current?.state === "suspended") {
        try { await audioCtxRef.current.resume(); } catch {}
      }
      window.removeEventListener("pointerdown", resume);
      window.removeEventListener("keydown", resume);
    };
    window.addEventListener("pointerdown", resume, { once: true });
    window.addEventListener("keydown", resume, { once: true });
  };

  const setupCanvasSizing = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const parent = canvas.parentElement;
    const ctx = canvas.getContext("2d");
    const dpr = Math.max(1, window.devicePixelRatio || 1);

    const applySize = () => {
      const w = (parent?.clientWidth || 300);
      const h = (parent?.clientHeight || height);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      canvas.width = Math.max(2, Math.floor(w * dpr));
      canvas.height = Math.max(2, Math.floor(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    applySize();

    try { resizeObsRef.current?.disconnect(); } catch {}
    resizeObsRef.current = new ResizeObserver(applySize);
    resizeObsRef.current.observe(parent || canvas);
  };

  const draw = (ctx, analyser, canvas, dpr) => {
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    // Softer motion
    const turbulenceFactor = 0.12;
    const maxAmplitude = (canvas.height / dpr) / 6 * boost;  // smaller than before
    const baseLine = (canvas.height / dpr) / 2;
    const numberOfWaves = 8;                                  // slightly fewer lines
    let t = 0;

    const gradient = (() => {
      const g = ctx.createLinearGradient(0, 0, canvas.width / dpr, 0);
      g.addColorStop(0,   "rgba(255, 25, 255, 0.25)");
      g.addColorStop(0.5, "rgba(25, 255, 255, 0.85)");
      g.addColorStop(1,   "rgba(255, 255, 25, 0.25)");
      return g;
    })();

    const animate = () => {
      if (!analyserRef.current) return;

      analyser.getByteFrequencyData(dataArray);

      // Compute a global, smoothed energy (keeps wave near center)
      const avg = dataArray.reduce((a, b) => a + b, 0) / (bufferLength * 255);
      smoothLevelRef.current =
        smoothness * smoothLevelRef.current + (1 - smoothness) * avg;

      const energyScale = 0.85 + 0.25 * smoothLevelRef.current; // ~0.85..1.1
      const viewW = canvas.width / dpr;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      t += 0.04;

      for (let j = 0; j < numberOfWaves; j++) {
        ctx.beginPath();
        ctx.lineWidth = 2;
        ctx.strokeStyle = gradient;

        let x = 0;
        const sliceWidth = viewW / dataArray.length;
        let lastX = 0;
        let lastY = baseLine;

        for (let i = 0; i < dataArray.length; i++) {
          // gentle per-sample variance around a midline
          const damp = 1 - Math.pow((2 * i) / dataArray.length - 1, 2);
          const amplitude = maxAmplitude * damp * energyScale;

          const invert = j % 2 ? 1 : -1;
          const freq = invert * (0.05 + turbulenceFactor);
          const y = baseLine + Math.sin(i * freq + t + j) * amplitude;

          if (i === 0) ctx.moveTo(x, y);
          else {
            const xc = (x + lastX) / 2;
            const yc = (y + lastY) / 2;
            ctx.quadraticCurveTo(lastX, lastY, xc, yc);
          }

          lastX = x;
          lastY = y;
          x += sliceWidth;
        }

        ctx.lineTo(canvas.width / dpr, lastY);
        ctx.stroke();
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    animate();
  };

  const setupFromStream = async (mediaStream) => {
    if (!mediaStream) return;

    // Wait until an audio track is present
    const tracks = mediaStream.getAudioTracks?.() || [];
    if (tracks.length === 0) {
      const retry = () => setupFromStream(mediaStream);
      const id = setInterval(() => {
        const t = mediaStream.getAudioTracks?.() || [];
        if (t.length > 0) {
          clearInterval(id);
          retry();
        }
      }, 150);
      setTimeout(() => clearInterval(id), 5000);
      return;
    }

    const ctx = await ensureAudioContext();
    resumeOnGestureOnce();

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.9; // smoother

    const source = ctx.createMediaStreamSource(mediaStream);
    source.connect(analyser);

    // Safari: need chain to destination to tick analysis (muted)
    const silent = ctx.createGain();
    silent.gain.value = 0;
    analyser.connect(silent);
    silent.connect(ctx.destination);

    analyserRef.current = analyser;
    sourceRef.current = source;
    gainSilentRef.current = silent;

    const canvas = canvasRef.current;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    draw(canvas.getContext("2d"), analyser, canvas, dpr);
  };

  const setupFromAudioUrl = async (url) => {
    const ctx = await ensureAudioContext();
    resumeOnGestureOnce();

    const el = new Audio(url);
    el.crossOrigin = "anonymous";
    el.loop = false;
    el.preload = "auto";
    el.play().catch(() => {});
    audioRef.current = el;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.9;

    const source = ctx.createMediaElementSource(el);
    source.connect(analyser);
    analyser.connect(ctx.destination);

    analyserRef.current = analyser;
    sourceRef.current = source;

    el.addEventListener("ended", () => {
      onEnded?.();
      cleanupAudio();
    });

    const canvas = canvasRef.current;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    draw(canvas.getContext("2d"), analyser, canvas, dpr);
  };

  useEffect(() => {
    setupCanvasSizing();

    if (stream) setupFromStream(stream);
    else if (audioUrl) setupFromAudioUrl(audioUrl);

    return () => {
      try { resizeObsRef.current?.disconnect(); } catch {}
      resizeObsRef.current = null;
      cleanupAudio();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream, audioUrl]);

  return (
    <div
      className="container-audio-wave"
      style={{ width: "100%", height: `${height}px`, pointerEvents: "none" }}
    >
      <canvas ref={canvasRef} />
    </div>
  );
};

export default AudioWave;
