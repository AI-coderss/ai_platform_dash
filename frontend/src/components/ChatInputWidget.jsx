import React, { useEffect, useRef, useState } from "react";
import SendIcon from "@mui/icons-material/Send";
import MicIcon from "@mui/icons-material/Mic";
import StopIcon from "@mui/icons-material/Stop";
import "../styles/ChatInputWidget.css";

/**
 * Explicit backend base URL (hardcoded for production).
 * Change to "http://localhost:5050" for local dev if needed.
 */
const API_BASE = "https://ai-platform-dsah-backend-chatbot.onrender.com";
const SDP_URL = `${API_BASE}/api/rtc-transcribe-connect`;

const ChatInputWidget = ({ onSendMessage }) => {
  const [inputText, setInputText] = useState("");
  const [state, setState] = useState("idle"); // idle | connecting | recording
  const [statusHint, setStatusHint] = useState("Idle");

  const textAreaRef = useRef(null);
  const transcriptionRef = useRef("");
  const pcRef = useRef(null);
  const streamRef = useRef(null);
  const dcRef = useRef(null);

  const isRecording = state === "recording";

  const log = (...args) => console.log("[RTC]", ...args);

  const adjustTextAreaHeight = (reset = false) => {
    if (!textAreaRef.current) return;
    textAreaRef.current.style.height = "auto";
    if (!reset) {
      textAreaRef.current.style.height = `${textAreaRef.current.scrollHeight}px`;
    }
  };
  useEffect(() => adjustTextAreaHeight(), []);

  // Wait for ICE gathering to complete so candidates are present in offer SDP
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
      // safety: continue anyway after 3s
      setTimeout(() => {
        pc.removeEventListener("icegatheringstatechange", onChange);
        resolve();
      }, 3000);
    });

  // Handle transcription messages arriving over the oai-events data channel
  const handleTranscriptEvent = (evt) => {
    try {
      const raw = typeof evt.data === "string" ? evt.data : "";
      if (!raw) return;
      const msg = JSON.parse(raw);

      // Helpful debug
      if (msg.type && !/delta|completed/.test(msg.type)) {
        log("event:", msg.type);
      }

      // partials
      if (
        msg.type === "input_audio_transcription.delta" ||
        msg.type === "transcription.delta"
      ) {
        const t = msg.delta?.text || msg.text || "";
        if (t) {
          const preview = (transcriptionRef.current + " " + t).trim();
          setInputText(preview);
          adjustTextAreaHeight();
        }
      }

      // completions
      if (
        msg.type === "input_audio_transcription.completed" ||
        msg.type === "transcription.completed" ||
        msg.type === "conversation.item.input_audio_transcription.completed"
      ) {
        const t =
          msg.transcript?.text ||
          msg.transcript ||
          msg.text ||
          "";
        if (t) {
          transcriptionRef.current = (transcriptionRef.current + " " + t).trim();
          setInputText(transcriptionRef.current);
          adjustTextAreaHeight();
        }
      }

      if (msg.type === "error" || msg.error) {
        console.error("Realtime error:", msg.error || msg);
      }
    } catch (e) {
      // Non-JSON frames can occur; ignore
    }
  };

  const startLiveTranscription = async () => {
    if (state !== "idle") return;
    setState("connecting");
    setStatusHint("Connecting…");
    transcriptionRef.current = "";
    setInputText("");
    adjustTextAreaHeight(true);

    try {
      // 1) Build RTCPeerConnection
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: ["stun:stun.l.google.com:19302"] }],
      });
      pcRef.current = pc;

      pc.oniceconnectionstatechange = () => {
        const s = pc.iceConnectionState;
        log("ICE:", s);
        if (s === "connected") setStatusHint("Connected");
        if (s === "failed" || s === "disconnected") {
          console.warn("ICE state:", s);
        }
      };

      pc.onconnectionstatechange = () => {
        log("PC State:", pc.connectionState);
      };

      // 2) Create the events data channel from the CLIENT (reliable)
      const dc = pc.createDataChannel("oai-events", { ordered: true });
      dcRef.current = dc;

      dc.onopen = () => {
        log("DataChannel open");
        setStatusHint("Listening… Speak now");
      };
      dc.onclose = () => log("DataChannel closed");
      dc.onerror = (e) => console.error("DataChannel error:", e);
      dc.onmessage = handleTranscriptEvent;

      // (Optional) also listen if server creates additional channels
      pc.ondatachannel = (event) => {
        log("ondatachannel from server:", event.channel?.label);
        if (event.channel?.label === "oai-events") {
          event.channel.onmessage = handleTranscriptEvent;
        }
      };

      // 3) Get mic stream
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      // 4) Attach ONE sender (sendonly) — no addTrack duplication
      const [track] = stream.getAudioTracks();
      const tx = pc.addTransceiver("audio", { direction: "sendonly" });
      await tx.sender.replaceTrack(track);

      // 5) Create offer, wait for ICE, POST offer SDP as-is
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitForIceGatheringComplete(pc);

      const resp = await fetch(SDP_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/sdp",
          "Cache-Control": "no-cache",
        },
        // IMPORTANT: send EXACT SDP (no transforms, no trimming)
        body: pc.localDescription.sdp,
      });

      const body = await resp.text(); // answer SDP
      if (!resp.ok) {
        console.error("SDP exchange failed:", body);
        throw new Error(`SDP exchange failed: ${resp.status}`);
      }
      if (!body.startsWith("v=")) {
        console.error("Non-SDP response from backend:", body.slice(0, 120));
        throw new Error("Backend returned non-SDP body (see console)");
      }

      await pc.setRemoteDescription({ type: "answer", sdp: body });
      setState("recording");
      setStatusHint("Listening… Speak now");
      log("Remote description set; ready to receive events.");
    } catch (err) {
      console.error("Start transcription error:", err);
      // Cleanup
      try {
        pcRef.current?.getSenders().forEach((s) => s.track && s.track.stop());
      } catch {}
      try {
        streamRef.current?.getTracks().forEach((t) => t.stop());
      } catch {}
      try {
        dcRef.current?.close();
      } catch {}
      try {
        pcRef.current?.close();
      } catch {}
      dcRef.current = null;
      pcRef.current = null;
      streamRef.current = null;
      setState("idle");
      setStatusHint("Idle");
    }
  };

  const stopLiveTranscription = () => {
    try { pcRef.current?.getSenders().forEach((s) => s.track && s.track.stop()); } catch {}
    try { streamRef.current?.getTracks().forEach((t) => t.stop()); } catch {}
    try { dcRef.current?.close(); } catch {}
    try { pcRef.current?.close(); } catch {}
    dcRef.current = null;
    pcRef.current = null;
    streamRef.current = null;
    setState("idle");
    setStatusHint("Idle");
    log("Stopped.");
  };

  const handleInputChange = (e) => {
    setInputText(e.target.value);
    adjustTextAreaHeight();
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (inputText.trim()) handleSendMessage();
    }
  };

  const handleSendMessage = () => {
    if (inputText.trim()) {
      onSendMessage?.({ text: inputText });
      setInputText("");
      adjustTextAreaHeight(true);
    }
    if (isRecording) stopLiveTranscription();
  };

  const handleIconClick = () => {
    if (inputText.trim()) {
      handleSendMessage();
    } else {
      isRecording ? stopLiveTranscription() : startLiveTranscription();
    }
  };

  useEffect(() => {
    return () => {
      try { stopLiveTranscription(); } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={`chat-container ${state}`}>
      <div className="status-row">
        <span className={`badge ${state}`}>{statusHint}</span>
      </div>

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
        className={`icon-btn ${state}`}
        onClick={handleIconClick}
        aria-label={isRecording ? "Stop recording" : (state === "connecting" ? "Connecting…" : "Start recording")}
        title={isRecording ? "Stop recording" : (state === "connecting" ? "Connecting…" : "Start recording")}
      >
        {inputText.trim().length > 0 ? (
          <SendIcon />
        ) : state === "connecting" ? (
          <span className="spinner" />
        ) : isRecording ? (
          <StopIcon />
        ) : (
          <MicIcon />
        )}
      </button>
    </div>
  );
};

export default ChatInputWidget;
  


