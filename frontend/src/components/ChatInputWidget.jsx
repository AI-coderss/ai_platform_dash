/* eslint-disable no-unused-vars */
import React, { useEffect, useRef, useState } from "react";
import SendIcon from "@mui/icons-material/Send";
import MicIcon from "@mui/icons-material/Mic";
import StopIcon from "@mui/icons-material/Stop";
import "../styles/ChatInputWidget.css";

/** Backend */
const API_BASE = "https://ai-platform-dsah-backend-chatbot.onrender.com";
const SDP_URL = `${API_BASE}/api/rtc-transcribe-connect`;

const ChatInputWidget = ({ onSendMessage }) => {
  const [inputText, setInputText] = useState("");
  const [state, setState] = useState("idle"); // idle | connecting | recording
  const [recTicker, setRecTicker] = useState("00:00"); // mm:ss

  const textAreaRef = useRef(null);
  const transcriptionRef = useRef("");
  const pcRef = useRef(null);
  const streamRef = useRef(null);
  const dcRef = useRef(null);

  // timer refs (fixes invisibility / staleness)
  const rafRef = useRef(null);
  const recStartRef = useRef(0);

  const isRecording = state === "recording";

  /** Autosize */
  const adjustTextAreaHeight = (reset = false) => {
    if (!textAreaRef.current) return;
    textAreaRef.current.style.height = "auto";
    if (!reset) {
      textAreaRef.current.style.height = `${textAreaRef.current.scrollHeight}px`;
    }
  };
  useEffect(() => adjustTextAreaHeight(), []);

  /** mm:ss formatter */
  const tickTimer = () => {
    const elapsed = Math.max(0, Date.now() - recStartRef.current);
    const totalSec = Math.floor(elapsed / 1000);
    const mm = String(Math.floor(totalSec / 60)).padStart(2, "0");
    const ss = String(totalSec % 60).padStart(2, "0");
    setRecTicker(`${mm}:${ss}`);
    rafRef.current = requestAnimationFrame(tickTimer);
  };
  const startTimer = () => {
    recStartRef.current = Date.now();
    setRecTicker("00:00");
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tickTimer);
  };
  const stopTimer = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    recStartRef.current = 0;
    setRecTicker("00:00");
  };

  /** ICE gather wait */
  const waitForIceGatheringComplete = (pc) =>
    new Promise((resolve) => {
      if (pc.iceGatheringState === "complete") return resolve();
      const onChange = () => {
        if (pc.iceGatheringState === "complete") {
          pc.removeEventListener("icegatheringstatechange", onChange);
          resolve();
        }
      };
      pc.addEventListener("icegatheringstatechange", onChange);
      setTimeout(() => {
        pc.removeEventListener("icegatheringstatechange", onChange);
        resolve();
      }, 3000);
    });

  /** Realtime frames */
  const handleTranscriptEvent = (evt) => {
    try {
      const raw = typeof evt.data === "string" ? evt.data : "";
      if (!raw) return;
      const msg = JSON.parse(raw);

      if (msg.type === "input_audio_transcription.delta" || msg.type === "transcription.delta") {
        const t = msg.delta?.text || msg.text || "";
        if (t) {
          const preview = (transcriptionRef.current + " " + t).trim();
          setInputText(preview);
          adjustTextAreaHeight();
        }
      }

      if (
        msg.type === "input_audio_transcription.completed" ||
        msg.type === "transcription.completed" ||
        msg.type === "conversation.item.input_audio_transcription.completed"
      ) {
        const t = msg.transcript?.text || msg.transcript || msg.text || "";
        if (t) {
          transcriptionRef.current = (transcriptionRef.current + " " + t).trim();
          setInputText(transcriptionRef.current);
          adjustTextAreaHeight();
        }
      }
    } catch { /* ignore non-JSON */ }
  };

  /** Start */
  const startLiveTranscription = async () => {
    if (state !== "idle") return;
    setState("connecting");
    // show timer immediately so the user "sees something"
    startTimer();

    transcriptionRef.current = "";
    setInputText("");
    adjustTextAreaHeight(true);

    try {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: ["stun:stun.l.google.com:19302"] }],
      });
      pcRef.current = pc;

      // Client data channel (guarantees events)
      const dc = pc.createDataChannel("oai-events", { ordered: true });
      dcRef.current = dc;
      dc.onmessage = handleTranscriptEvent;

      // Accept server-created too
      pc.ondatachannel = (event) => {
        if (event.channel?.label === "oai-events") {
          event.channel.onmessage = handleTranscriptEvent;
        }
      };

      // Mic
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;

      // Single sender (sendonly)
      const [track] = stream.getAudioTracks();
      const tx = pc.addTransceiver("audio", { direction: "sendonly" });
      await tx.sender.replaceTrack(track);

      // SDP
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitForIceGatheringComplete(pc);

      const resp = await fetch(SDP_URL, {
        method: "POST",
        headers: { "Content-Type": "application/sdp", "Cache-Control": "no-cache" },
        body: pc.localDescription.sdp,
      });

      const body = await resp.text();
      if (!resp.ok || !body.startsWith("v=")) {
        throw new Error("SDP exchange failed or non-SDP answer");
      }

      await pc.setRemoteDescription({ type: "answer", sdp: body });
      setState("recording"); // timer already running
    } catch (err) {
      // Cleanup on failure
      try { pcRef.current?.getSenders().forEach((s) => s.track && s.track.stop()); } catch {}
      try { streamRef.current?.getTracks().forEach((t) => t.stop()); } catch {}
      try { dcRef.current?.close(); } catch {}
      try { pcRef.current?.close(); } catch {}
      dcRef.current = null;
      pcRef.current = null;
      streamRef.current = null;
      stopTimer();
      setState("idle");
    }
  };

  /** Stop */
  const stopLiveTranscription = () => {
    try { pcRef.current?.getSenders().forEach((s) => s.track && s.track.stop()); } catch {}
    try { streamRef.current?.getTracks().forEach((t) => t.stop()); } catch {}
    try { dcRef.current?.close(); } catch {}
    try { pcRef.current?.close(); } catch {}
    dcRef.current = null;
    pcRef.current = null;
    streamRef.current = null;
    stopTimer();
    setState("idle");
  };

  /** Text input */
  const handleInputChange = (e) => {
    setInputText(e.target.value);
    adjustTextAreaHeight();
  };

  /** Enter: if connecting/recording → stop & send; else send text */
  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (state === "recording" || state === "connecting") {
        stopLiveTranscription();
        const text = (transcriptionRef.current || inputText || "").trim();
        if (text) {
          onSendMessage?.({ text });
          setInputText("");
          transcriptionRef.current = "";
        }
        adjustTextAreaHeight(true);
      } else if (inputText.trim()) {
        handleSendMessage();
      }
    }
  };

  const handleSendMessage = () => {
    if (inputText.trim()) {
      onSendMessage?.({ text: inputText.trim() });
      setInputText("");
      transcriptionRef.current = "";
      adjustTextAreaHeight(true);
    }
    if (state === "recording" || state === "connecting") stopLiveTranscription();
  };

  /** Main button */
  const handleIconClick = () => {
    if (inputText.trim()) {
      handleSendMessage();
    } else {
      if (state === "recording" || state === "connecting") {
        stopLiveTranscription();
      } else {
        startLiveTranscription();
      }
    }
  };

  /** Cleanup on unmount */
  useEffect(() => {
    return () => {
      try { stopLiveTranscription(); } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={`chat-container ${state}`}>
      <textarea
        ref={textAreaRef}
        className="chat-input"
        placeholder="Chat in text or start speaking..."
        value={inputText}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        rows={1}
        style={{ resize: "none", overflow: "hidden" }}
      />

      <button
        className={`icon-btn ${state} ${inputText.trim() ? "will-send" : ""}`}
        onClick={handleIconClick}
        aria-label={
          inputText.trim()
            ? "Send"
            : (state === "recording" || state === "connecting")
            ? "Stop recording"
            : "Start recording"
        }
        title={
          inputText.trim()
            ? "Send"
            : (state === "recording" || state === "connecting")
            ? "Stop recording"
            : "Start recording"
        }
      >
        {/* CONNECTING: show stop + live timer immediately */}
        {state === "connecting" && !inputText.trim() && (
          <div className="rec-face" aria-hidden>
            <StopIcon className="icon i-stop" />
            <div className="rec-timer">{recTicker}</div>
          </div>
        )}

        {/* RECORDING: stop icon + tiny timer */}
        {state === "recording" && !inputText.trim() && (
          <div className="rec-face" aria-hidden>
            <StopIcon className="icon i-stop" />
            <div className="rec-timer">{recTicker}</div>
          </div>
        )}

        {/* IDLE (mic) */}
        {state === "idle" && !inputText.trim() && <MicIcon className="icon i-mic" />}

        {/* READY TO SEND */}
        {inputText.trim().length > 0 && <SendIcon className="icon i-send" />}
      </button>
    </div>
  );
};

export default ChatInputWidget;



  


