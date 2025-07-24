import React, { useEffect, useRef, useState } from "react";
import "../styles/AudioPlayer.css";

const AudioPlayer = ({ src }) => {
  const canvasRef = useRef(null);
  const audioRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const audio = new Audio(src);
    audio.crossOrigin = "anonymous";
    audioRef.current = audio;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    canvas.width = canvas.parentElement?.clientWidth || 600;
    canvas.height = 150;

    const audioContext = new (window.AudioContext ||
      window.webkitAudioContext)();
    audioContextRef.current = audioContext;

    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyserRef.current = analyser;

    const source = audioContext.createMediaElementSource(audio);
    source.connect(analyser);
    analyser.connect(audioContext.destination);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      analyser.getByteFrequencyData(dataArray);

      const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
      gradient.addColorStop(0, "rgba(255, 25, 255, 0.2)");
      gradient.addColorStop(0.5, "rgba(25, 255, 255, 0.75)");
      gradient.addColorStop(1, "rgba(255, 255, 25, 0.2)");

      ctx.beginPath();
      ctx.lineWidth = 2;
      ctx.strokeStyle = gradient;

      let x = 0;
      const sliceWidth = canvas.width / dataArray.length;

      for (let i = 0; i < dataArray.length; i++) {
        const v = dataArray[i] / 128.0;
        const y = (v * canvas.height) / 2;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        x += sliceWidth;
      }

      ctx.stroke();
      requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (audioContext.state !== "closed") {
        audioContext.close();
      }
    };
  }, [src]);

  const handlePlayPause = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play();
      setIsPlaying(true);
    }
  };

  return (
    <div className={`glass-audio-player ${collapsed ? "collapsed" : ""}`}>
      <div className="audio-controls">
        <button onClick={handlePlayPause} className="svg-btn">
          {isPlaying ? (
            <svg height="20" width="20" viewBox="0 0 20 20">
              <rect x="4" y="4" width="4" height="12" />
              <rect x="12" y="4" width="4" height="12" />
            </svg>
          ) : (
            <svg height="20" width="20" viewBox="0 0 20 20">
              <polygon points="3,2 17,10 3,18" />
            </svg>
          )}
        </button>

        <button onClick={() => setCollapsed(!collapsed)} className="svg-btn">
          <svg height="20" width="20" viewBox="0 0 20 20">
            <path d="M6 8l4 4 4-4" stroke="black" strokeWidth="2" fill="none" />
          </svg>
        </button>
      </div>
      {!collapsed && <canvas ref={canvasRef}></canvas>}
    </div>
  );
};

export default AudioPlayer;
