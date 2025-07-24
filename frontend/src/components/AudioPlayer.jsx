import React, { useEffect, useRef, useState } from "react";
import "../styles/AudioPlayer.css";

const AudioPlayer = ({ src, onEnded }) => {
  const audioRef = useRef(null);
  const canvasRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [volume, setVolume] = useState(0.6);
  const [collapsed, setCollapsed] = useState(false);

  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const animationIdRef = useRef(null);

  const cleanupAudioContext = () => {
    cancelAnimationFrame(animationIdRef.current);
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
  };

  const setupVisualizer = () => {
    if (!audioRef.current) return;

    cleanupAudioContext();

    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;

    const source = audioCtx.createMediaElementSource(audioRef.current);
    source.connect(analyser);
    analyser.connect(audioCtx.destination);

    audioCtxRef.current = audioCtx;
    analyserRef.current = analyser;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
    gradient.addColorStop(0, "rgba(255, 25, 255, 0.2)");
    gradient.addColorStop(0.5, "rgba(25, 255, 255, 0.75)");
    gradient.addColorStop(1, "rgba(255, 255, 25, 0.2)");

    const baseLine = canvas.height / 2;
    const maxAmplitude = canvas.height / 3.5;
    const numberOfWaves = 10;
    let globalTime = 0;

    const animate = () => {
      const analyser = analyserRef.current;
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      globalTime += 0.05;

      for (let j = 0; j < numberOfWaves; j++) {
        ctx.beginPath();
        ctx.lineWidth = 2;
        ctx.strokeStyle = gradient;

        let x = 0;
        const sliceWidth = canvas.width / dataArray.length;
        let lastX = 0;
        let lastY = baseLine;

        for (let i = 0; i < dataArray.length; i++) {
          const v = dataArray[i] / 128.0;
          const mid = dataArray.length / 2;
          const distanceFromMid = Math.abs(i - mid) / mid;
          const dampFactor = 1 - Math.pow((2 * i) / dataArray.length - 1, 2);
          const amplitude = maxAmplitude * dampFactor * (1 - distanceFromMid);
          const isWaveInverted = j % 2 ? 1 : -1;
          const frequency = isWaveInverted * (0.05 + 0.25);
          const y = baseLine + Math.sin(i * frequency + globalTime + j) * amplitude * v;

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

        ctx.lineTo(canvas.width, lastY);
        ctx.stroke();
      }

      animationIdRef.current = requestAnimationFrame(animate);
    };

    animate();
  };

  useEffect(() => {
    if (!src) return;

    const audio = new Audio(src);
    audio.crossOrigin = "anonymous";
    audio.volume = volume;
    audioRef.current = audio;

    setupVisualizer();
    audio.play();
    setIsPlaying(true);

    const handleEnded = () => {
      setIsPlaying(false);
      onEnded?.();
    };

    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.pause();
      audio.removeEventListener("ended", handleEnded);
      cleanupAudioContext();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  // 👇 Handle toggle playback
  const togglePlayback = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
      setupVisualizer(); // always re-init waveform on play
    }

    setIsPlaying(!isPlaying);
  };

  // 👇 Handle toggle collapse (and re-animate)
  const toggleCollapse = () => {
    setCollapsed((prev) => {
      const newVal = !prev;
      if (!newVal) {
        // re-render waveform when expanded again
        setupVisualizer();
      }
      return newVal;
    });
  };

  const handleVolumeChange = (e) => {
    const vol = parseFloat(e.target.value);
    setVolume(vol);
    if (audioRef.current) {
      audioRef.current.volume = vol;
    }
  };

  const seek = (seconds) => {
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime += seconds;
    }
  };

  return (
    <div className={`audio-player ${collapsed ? "collapsed" : ""}`}>
      {/* 🎛️ Controls Row */}
      <div className="controls">
        <button onClick={() => seek(-10)} title="Rewind 10s">⏪</button>
        <button onClick={togglePlayback} title={isPlaying ? "Pause" : "Play"}>
          {isPlaying ? "⏸️" : "▶️"}
        </button>
        <button onClick={() => seek(10)} title="Forward 10s">⏩</button>
        <button onClick={toggleCollapse} title="Collapse/Expand">
          {collapsed ? "🔼" : "🔽"}
        </button>
      </div>

      {/* 🔊 Volume Slider */}
      <div className="volume-slider">
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={handleVolumeChange}
          title="Volume"
        />
      </div>

      {/* 🎨 Visualizer */}
      {!collapsed && (
        <canvas
          ref={canvasRef}
          width={600}
          height={150}
          className="audio-canvas"
        />
      )}
    </div>
  );
};

export default AudioPlayer;



