/* eslint-disable no-unused-vars */
import React, { useEffect, useRef } from "react";
import "../styles/AudioWave.css";

/**
 * Props:
 *  - stream?: MediaStream         (preferred for your WebRTC assistant audio)
 *  - audioUrl?: string            (optional fallback to visualize a file/URL)
 *  - onEnded?: () => void
 *  - boost?: number               (vertical exaggeration, default 2.4)
 *  - height?: number              (canvas CSS height; default 72)
 */
const AudioWave = ({ stream, audioUrl, onEnded, boost = 2.4, height = 72 }) => {
  const canvasRef = useRef(null);

  const audioRef = useRef(null);               // <audio> when using audioUrl
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const gainSilentRef = useRef(null);          // silent gain → destination (Safari)
  const sourceRef = useRef(null);              // source node (stream or element)
  const rafRef = useRef(null);
  const resizeObsRef = useRef(null);

  // --- helpers --------------------------------------------------------------
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

    // Try to resume ASAP (Chrome/Edge/Firefox gate without gesture sometimes)
    if (ctx.state === "suspended") {
      try { await ctx.resume(); } catch {}
    }
    return ctx;
  };

  const resumeOnGestureOnce = () => {
    const resume = async () => {
      if (!audioCtxRef.current) return;
      if (audioCtxRef.current.state === "suspended") {
        try { await audioCtxRef.current.resume(); } catch {}
      }
      window.removeEventListener("pointerdown", resume);
      window.removeEventListener("keydown", resume);
    };
    window.addEventListener("pointerdown", resume, { once: true });
    window.addEventListener("keydown", resume, { once: true });
  };

  const draw = (ctx, analyser, canvas, dpr) => {
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const turbulenceFactor = 0.25;
    const maxAmplitude = canvas.height / dpr / 3.5 * boost;
    const baseLine = (canvas.height / dpr) / 2;
    const numberOfWaves = 10;
    let t = 0;

    const createGradient = () => {
      const g = ctx.createLinearGradient(0, 0, canvas.width / dpr, 0);
      g.addColorStop(0,   "rgba(255, 25, 255, 0.22)");
      g.addColorStop(0.5, "rgba(25, 255, 255, 0.88)");
      g.addColorStop(1,   "rgba(255, 255, 25, 0.22)");
      return g;
    };
    const gradient = createGradient();

    const animate = () => {
      if (!analyserRef.current) return; // guard after unmount/cleanup

      analyser.getByteFrequencyData(dataArray);

      // If there's silence or suspended ctx, still animate a subtle idle motion
      const sum = dataArray.reduce((a, b) => a + b, 0);
      const hasEnergy = sum > 0;

      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);
      t += 0.05;

      // IMPORTANT: render in CSS pixel space (not DPR space)
      const viewW = width / dpr;
      const viewH = height / dpr;

      for (let j = 0; j < numberOfWaves; j++) {
        ctx.beginPath();
        ctx.lineWidth = 2;
        ctx.strokeStyle = gradient;

        let x = 0;
        const sliceWidth = viewW / dataArray.length;
        let lastX = 0;
        let lastY = baseLine;

        for (let i = 0; i < dataArray.length; i++) {
          // turn bytes into 0..~2 range (center around 1)
          const v = hasEnergy ? dataArray[i] / 128.0 : 1.0 + 0.02 * Math.sin((i + t) * 0.25);

          const mid = dataArray.length / 2;
          const distanceFromMid = Math.abs(i - mid) / mid;
          const damp = 1 - Math.pow((2 * i) / dataArray.length - 1, 2);

          const amplitude = maxAmplitude * damp * (1 - distanceFromMid);
          const invert = j % 2 ? 1 : -1;
          const frequency = invert * (0.05 + turbulenceFactor);
          const y = baseLine + Math.sin(i * frequency + t + j) * amplitude * v;

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

        ctx.lineTo(viewW, lastY);
        ctx.stroke();
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    animate();
  };

  const setupCanvasSizing = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const parent = canvas.parentElement;
    const ctx = canvas.getContext("2d");
    const dpr = Math.max(1, window.devicePixelRatio || 1);

    const applySize = () => {
      const w = (parent?.clientWidth || 600);
      const h = (parent?.clientHeight || height);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      canvas.width = Math.max(2, Math.floor(w * dpr));
      canvas.height = Math.max(2, Math.floor(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // draw in CSS pixels
    };

    applySize();

    // Observe parent size changes
    if (resizeObsRef.current) {
      try { resizeObsRef.current.disconnect(); } catch {}
    }
    resizeObsRef.current = new ResizeObserver(applySize);
    resizeObsRef.current.observe(parent || canvas);
  };

  const setupFromStream = async (mediaStream) => {
    if (!mediaStream) return;

    // Wait for an audio track if not present yet
    const tracks = mediaStream.getAudioTracks ? mediaStream.getAudioTracks() : [];
    if (!tracks || tracks.length === 0) {
      const handler = () => {
        try { mediaStream.removeEventListener("addtrack", handler); } catch {}
        setupFromStream(mediaStream);
      };
      try {
        mediaStream.addEventListener("addtrack", handler, { once: true });
      } catch {
        // Some browsers don’t implement addEventListener on MediaStream
        // Poll briefly as a fallback
        const poll = setInterval(() => {
          const t = mediaStream.getAudioTracks?.() || [];
          if (t.length > 0) {
            clearInterval(poll);
            setupFromStream(mediaStream);
          }
        }, 150);
        setTimeout(() => clearInterval(poll), 5000);
      }
      return;
    }

    const ctx = await ensureAudioContext();
    resumeOnGestureOnce();

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;

    const source = ctx.createMediaStreamSource(mediaStream);
    source.connect(analyser);

    // Safari/WebKit sometimes needs the chain to reach destination to update
    const silentGain = ctx.createGain();
    silentGain.gain.value = 0.0;
    analyser.connect(silentGain);
    silentGain.connect(ctx.destination);

    analyserRef.current = analyser;
    sourceRef.current = source;
    gainSilentRef.current = silentGain;

    // Render
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
    el.play().catch(() => {/* autoplay might be blocked; gesture resume handles it */});
    audioRef.current = el;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;

    const source = ctx.createMediaElementSource(el);
    source.connect(analyser);
    analyser.connect(ctx.destination); // this one should be audible (file)

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

  // --- lifecycle -----------------------------------------------------------
  useEffect(() => {
    setupCanvasSizing();

    // Decide which input to visualize
    if (stream) {
      setupFromStream(stream);
    } else if (audioUrl) {
      setupFromAudioUrl(audioUrl);
    }

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
