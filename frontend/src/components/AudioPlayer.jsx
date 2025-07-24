import React, { useEffect, useRef, useState } from "react";
import "../styles/AudioPlayer.css";

const AudioPlayer = ({ src }) => {
  const audioRef = useRef(null);
  const canvasRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState(false);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play().catch((err) => {
        console.error("Audio playback error:", err);
        setError(true);
      });
    }
    setIsPlaying(!isPlaying);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const audio = audioRef.current;

    if (!canvas || !audio) return;

    const ctx = canvas.getContext("2d");
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const analyser = audioCtx.createAnalyser();
    const source = audioCtx.createMediaElementSource(audio);
    source.connect(analyser);
    analyser.connect(audioCtx.destination);
    analyser.fftSize = 64;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      dataArray.forEach((value, i) => {
        const barHeight = value / 2;
        const barWidth = 3;
        ctx.fillStyle = "#2563eb";
        ctx.fillRect(i * (barWidth + 1), canvas.height - barHeight, barWidth, barHeight);
      });
    };

    draw();
  }, [src]);

  return (
    <div className="audio-player">
      <audio ref={audioRef} src={src} preload="auto" />
      <canvas ref={canvasRef} width={300} height={80}></canvas>
      <div className="controls">
        <button onClick={togglePlay}>
          {isPlaying ? "⏸ Pause" : "▶️ Play"}
        </button>
        {error && <div className="error-msg">⚠️ Unable to play audio</div>}
      </div>
    </div>
  );
};

export default AudioPlayer;


