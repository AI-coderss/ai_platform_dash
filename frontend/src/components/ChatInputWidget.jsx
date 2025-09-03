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
const SDP_URL   = `${API_BASE}/api/rtc-transcribe-connect`;

const ChatInputWidget = ({ onSendMessage }) => {
  const [inputText, setInputText] = useState("");
  const [state, setState] = useState("idle"); // idle | connecting | recording

  const textAreaRef = useRef(null);
  const transcriptionRef = useRef("");
  const pcRef = useRef(null);
  const streamRef = useRef(null);
  const isRecording = state === "recording";

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
      // Safety timeout: proceed even if we don't see "complete"
      setTimeout(() => {
        pc.removeEventListener("icegatheringstatechange", onChange);
        resolve();
      }, 3000);
    });

  // Handle transcription messages arriving over the server-created data channel
  const handleTranscriptEvent = (evt) => {
    try {
      const msg = JSON.parse(evt.data);

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

      // completions (various names possible)
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
    } catch {
      // Non-JSON frames can occur; ignore
    }
  };

  const startLiveTranscription = async () => {
    if (state !== "idle") return;
    setState("connecting");
    transcriptionRef.current = "";
    setInputText("");
    adjustTextAreaHeight(true);

    let pc;
    try {
      // 1) Build RTCPeerConnection
      pc = new RTCPeerConnection({
        iceServers: [{ urls: ["stun:stun.l.google.com:19302"] }],
        // bundlePolicy: "max-bundle", // optional
      });
      pcRef.current = pc;

      pc.oniceconnectionstatechange = () => {
        const s = pc.iceConnectionState;
        if (s === "failed" || s === "disconnected") {
          console.warn("ICE state:", s);
        }
      };

      // The server will create the "oai-events" data channel; listen for it.
      pc.ondatachannel = (event) => {
        const ch = event.channel;
        if (!ch) return;
        // OpenAI sends events on a channel typically named "oai-events"
        ch.onmessage = handleTranscriptEvent;
      };

      // 2) Get mic stream & add as sendonly transceiver
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      streamRef.current = stream;

      // Ensure a single audio m-line with sendonly direction
      const [track] = stream.getAudioTracks();
      pc.addTransceiver(track, { direction: "sendonly" });
      pc.addTrack(track, stream);

      // 3) Create offer, wait for ICE, send to backend (NO legacy flags)
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitForIceGatheringComplete(pc);

      const resp = await fetch(SDP_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/sdp",
          "Cache-Control": "no-cache"
        },
        // VERY IMPORTANT: send the EXACT SDP (no transforms). Chrome will include \r\n.
        body: pc.localDescription.sdp
      });

      const body = await resp.text(); // answer SDP as TEXT
      if (!resp.ok) {
        console.error("SDP exchange failed:", body);
        throw new Error(`SDP exchange failed: ${resp.status}`);
      }

      // DO NOT normalize or trim line-endings — pass the SDP back exactly
      if (!body.startsWith("v=")) {
        console.error("Non-SDP response from backend (prefix):", body.slice(0, 80));
        throw new Error("Backend returned non-SDP body (see console)");
      }

      await pc.setRemoteDescription({ type: "answer", sdp: body });
      setState("recording");
    } catch (err) {
      console.error("Start transcription error:", err);
      // Cleanup
      try { pcRef.current?.getSenders().forEach((s) => s.track && s.track.stop()); } catch {}
      try { streamRef.current?.getTracks().forEach((t) => t.stop()); } catch {}
      try { pcRef.current?.close(); } catch {}
      pcRef.current = null;
      streamRef.current = null;
      setState("idle");
    }
  };

  const stopLiveTranscription = () => {
    try { pcRef.current?.getSenders().forEach((s) => s.track && s.track.stop()); } catch {}
    try { streamRef.current?.getTracks().forEach((t) => t.stop()); } catch {}
    try { pcRef.current?.close(); } catch {}
    pcRef.current = null;
    streamRef.current = null;
    setState("idle");
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
    return () => { try { stopLiveTranscription(); } catch {} };
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

