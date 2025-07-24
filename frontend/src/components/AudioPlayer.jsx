import React, { useRef, useEffect, useState } from "react";
import "../styles/AudioPlayer.css";

const AudioPlayer = ({ src, onEnd }) => {
  const audioRef = useRef(null);
  const canvasRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  };

  const skip = (time) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime += time;
  };

  const drawVisualizer = () => {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const analyser = audioCtx.createAnalyser();
    const source = audioCtx.createMediaElementSource(audioRef.current);
    source.connect(analyser);
    analyser.connect(audioCtx.destination);

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    analyser.fftSize = 128;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      dataArray.forEach((value, i) => {
        const x = i * 4;
        const height = value / 2;
        ctx.fillStyle = "#2563eb";
        ctx.fillRect(x, canvas.height - height, 3, height);
      });
    };

    draw();
  };

  useEffect(() => {
    drawVisualizer();
  }, []);

  return (
    <div className="audio-player">
      <audio
        ref={audioRef}
        src={src}
        onEnded={() => {
          setIsPlaying(false);
          onEnd?.();
        }}
        preload="auto"
      />
      <canvas ref={canvasRef} width="300" height="60" />
      <div className="controls">
        <button onClick={() => skip(-5)}>⏪</button>
        <button onClick={togglePlay}>{isPlaying ? "⏸" : "▶️"}</button>
        <button onClick={() => skip(5)}>⏩</button>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={volume}
          onChange={(e) => setVolume(parseFloat(e.target.value))}
        />
      </div>
    </div>
  );
};

export default AudioPlayer;

