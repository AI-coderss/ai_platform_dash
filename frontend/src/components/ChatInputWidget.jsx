import React, { useState, useRef, useEffect } from "react";
import SendIcon from "@mui/icons-material/Send";
import MicIcon from "@mui/icons-material/Mic";
import StopIcon from "@mui/icons-material/Stop";
import "../styles/ChatInputWidget.css";

const REALTIME_WS_URL = "wss://api.openai.com/v1/realtime?intent=transcription";

const ChatInputWidget = ({ onSendMessage }) => {
  const [inputText, setInputText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [ws, setWs] = useState(null);
  const textAreaRef = useRef(null);
  const transcriptionRef = useRef("");
  const audioCtxRef = useRef(null);
  const sourceRef = useRef(null);
  const processorRef = useRef(null);
  const mediaStreamRef = useRef(null);

  // Resize textarea to content
  const adjustTextAreaHeight = (reset = false) => {
    if (!textAreaRef.current) return;
    textAreaRef.current.style.height = "auto";
    if (!reset) {
      textAreaRef.current.style.height = `${textAreaRef.current.scrollHeight}px`;
    }
  };

  useEffect(() => adjustTextAreaHeight(), []);

  // Convert Float32 PCM to 16-bit PCM and base64 encode
  const float32ToBase64PCM16 = (float32) => {
    const len = float32.length;
    const pcm16 = new Int16Array(len);
    for (let i = 0; i < len; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]));
      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    // Base64 encode
    let binary = "";
    const bytes = new Uint8Array(pcm16.buffer);
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  };

  const configureSession = (socket) => {
    // Match the server payload; you can tweak params here:
    const sessionUpdate = {
      type: "transcription_session.update",
      input_audio_format: "pcm16",
      input_audio_transcription: {
        model: "gpt-4o-transcribe",
        // language: "en",
        // prompt: "",
      },
      turn_detection: {
        type: "server_vad",
        threshold: 0.5,
        prefix_padding_ms: 300,
        silence_duration_ms: 500,
      },
      input_audio_noise_reduction: { type: "near_field" },
      include: ["item.input_audio_transcription.logprobs"],
    };
    socket.send(JSON.stringify(sessionUpdate));
  };

  const handleRealtimeMessage = (event) => {
    try {
      const msg = JSON.parse(event.data);

      // You may see several event types — handle broadly:
      // a) speech segment-level updates (partial)
      if (msg.type === "input_audio_buffer.speech_started") {
        // could show a tiny "listening..." indicator
      }

      // b) completed chunks — name can differ depending on release;
      // handle multiple possibilities conservatively:
      if (
        msg.type === "input_audio_transcription.completed" ||
        msg.type === "conversation.item.input_audio_transcription.completed" ||
        msg.type === "transcription.completed" // fallback name if used
      ) {
        const text =
          msg.transcript?.text ||
          msg.transcript ||
          msg.text ||
          "";

        if (text) {
          transcriptionRef.current += (transcriptionRef.current ? " " : "") + text;
          setInputText(transcriptionRef.current);
          adjustTextAreaHeight();
        }
      }

      // c) committed ordering cues (optional to handle)
      //    You can use item_id / previous_item_id here if needed.
      // if (msg.type === "input_audio_buffer.committed") { ... }

      // d) errors
      if (msg.type === "error" || msg.error) {
        console.error("Realtime error:", msg.error || msg);
      }
    } catch (e) {
      // Some frames may be binary (e.g., audio out) — ignore non-JSON
    }
  };

  const openRealtime = async () => {
    // 1) get ephemeral client_secret from our backend
    const r = await fetch("/realtime/token", { method: "POST" });
    const { client_secret } = await r.json();
    if (!client_secret) throw new Error("No client_secret");

    // 2) open WS with required subprotocols
    //    NOTE: The exact strings here follow common patterns for browser WS auth.
    //    If your account/doc expects different values, update accordingly.
    const protocols = [
      "realtime",
      `openai-insecure-api-key.${client_secret}`,
      "openai-beta.realtime=v1",
    ];
    const socket = new WebSocket(REALTIME_WS_URL, protocols);

    socket.onopen = () => configureSession(socket);
    socket.onmessage = handleRealtimeMessage;
    socket.onerror = (e) => console.error("WS error:", e);
    socket.onclose = () => console.log("WS closed");

    setWs(socket);
  };

  const startLiveTranscription = async () => {
    transcriptionRef.current = "";
    setInputText("");
    adjustTextAreaHeight(true);

    // Open Realtime connection
    await openRealtime();

    // Mic + audio pipeline
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaStreamRef.current = stream;

    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    audioCtxRef.current = audioCtx;

    const src = audioCtx.createMediaStreamSource(stream);
    sourceRef.current = src;

    // ScriptProcessorNode is widely supported; good enough for streaming PCM16
    const processor = audioCtx.createScriptProcessor(4096, 1, 1);
    processorRef.current = processor;

    processor.onaudioprocess = (e) => {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      const input = e.inputBuffer.getChannelData(0);
      const b64 = float32ToBase64PCM16(input);
      ws.send(JSON.stringify({
        type: "input_audio_buffer.append",
        audio: b64
      }));
    };

    src.connect(processor);
    processor.connect(audioCtx.destination);

    setIsRecording(true);
  };

  const stopLiveTranscription = () => {
    // Signal end of current buffer / turn (helps when VAD off or end-of-utterance)
    try {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
      }
    } catch {}

    // Tear down audio graph
    try {
      processorRef.current?.disconnect();
      sourceRef.current?.disconnect();
      audioCtxRef.current?.close();
    } catch {}
    processorRef.current = null;
    sourceRef.current = null;
    audioCtxRef.current = null;

    // Close WS after a brief grace period (optional)
    setTimeout(() => {
      try { ws?.close(); } catch {}
      setWs(null);
    }, 150);

    setIsRecording(false);
  };

  // UI handlers
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
      if (isRecording) stopLiveTranscription();
      else startLiveTranscription();
    }
  };

  useEffect(() => {
    return () => {
      try { ws?.close(); } catch {}
      try { mediaStreamRef.current?.getTracks().forEach(t => t.stop()); } catch {}
    };
  }, [ws]);

  return (
    <div className="chat-container">
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
      <button className="icon-btn" onClick={handleIconClick}>
        {inputText.trim().length > 0 ? <SendIcon /> : isRecording ? <StopIcon /> : <MicIcon />}
      </button>
    </div>
  );
};

export default ChatInputWidget;

