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

  const textAreaRef = useRef(null);
  const transcriptionRef = useRef("");
  const pcRef = useRef(null);
  const streamRef = useRef(null);
  const dcRef = useRef(null);

  const isRecording = state === "recording";

  const adjustTextAreaHeight = (reset = false) => {
    if (!textAreaRef.current) return;
    textAreaRef.current.style.height = "auto";
    if (!reset) {
      textAreaRef.current.style.height = `${textAreaRef.current.scrollHeight}px`;
    }
  };
  useEffect(() => adjustTextAreaHeight(), []);

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

  const handleTranscriptEvent = (evt) => {
    try {
      const raw = typeof evt.data === "string" ? evt.data : "";
      if (!raw) return;
      const msg = JSON.parse(raw);

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
    } catch {
      /* ignore non-JSON frames */
    }
  };

  const startLiveTranscription = async () => {
    if (state !== "idle") return;
    setState("connecting");
    transcriptionRef.current = "";
    setInputText("");
    adjustTextAreaHeight(true);

    try {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: ["stun:stun.l.google.com:19302"] }],
      });
      pcRef.current = pc;

      // Create the events data channel from the client
      const dc = pc.createDataChannel("oai-events", { ordered: true });
      dcRef.current = dc;
      dc.onmessage = handleTranscriptEvent;

      // (optional) if server also creates channels, listen to them
      pc.ondatachannel = (event) => {
        if (event.channel?.label === "oai-events") {
          event.channel.onmessage = handleTranscriptEvent;
        }
      };

      // Get mic
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      // Attach ONE sender with explicit direction
      const [track] = stream.getAudioTracks();
      const tx = pc.addTransceiver("audio", { direction: "sendonly" });
      await tx.sender.replaceTrack(track);

      // Offer → wait ICE → POST SDP (verbatim)
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitForIceGatheringComplete(pc);

      const resp = await fetch(SDP_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/sdp",
          "Cache-Control": "no-cache",
        },
        body: pc.localDescription.sdp,
      });

      const body = await resp.text();
      if (!resp.ok || !body.startsWith("v=")) {
        throw new Error("SDP exchange failed or non-SDP answer");
      }

      await pc.setRemoteDescription({ type: "answer", sdp: body });
      setState("recording");
    } catch (err) {
      // Cleanup
      try { pcRef.current?.getSenders().forEach((s) => s.track && s.track.stop()); } catch {}
      try { streamRef.current?.getTracks().forEach((t) => t.stop()); } catch {}
      try { dcRef.current?.close(); } catch {}
      try { pcRef.current?.close(); } catch {}
      dcRef.current = null;
      pcRef.current = null;
      streamRef.current = null;
      setState("idle");
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
            : isRecording
            ? "Stop recording"
            : state === "connecting"
            ? "Connecting"
            : "Start recording"
        }
        title={
          inputText.trim()
            ? "Send"
            : isRecording
            ? "Stop recording"
            : state === "connecting"
            ? "Connecting"
            : "Start recording"
        }
      >
        {inputText.trim().length > 0 ? (
          <SendIcon className="icon i-send" />
        ) : state === "connecting" ? (
          <span className="spinner" aria-hidden />
        ) : isRecording ? (
          <StopIcon className="icon i-stop" />
        ) : (
          <MicIcon className="icon i-mic" />
        )}
      </button>
    </div>
  );
};

export default ChatInputWidget;

  


