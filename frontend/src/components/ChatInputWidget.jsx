import React, { useEffect, useRef, useState } from "react";
import SendIcon from "@mui/icons-material/Send";
import MicIcon from "@mui/icons-material/Mic";
import StopIcon from "@mui/icons-material/Stop";
import "../styles/ChatInputWidget.css";

const REALTIME_URL = "https://api.openai.com/v1/realtime?model=gpt-4o-transcribe";

const ChatInputWidget = ({ onSendMessage }) => {
  const [inputText, setInputText] = useState("");
  const [isRecording, setIsRecording] = useState(false);

  const textAreaRef = useRef(null);
  const transcriptionRef = useRef("");
  const pcRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const dataChanRef = useRef(null);

  const adjustTextAreaHeight = (reset = false) => {
    if (!textAreaRef.current) return;
    textAreaRef.current.style.height = "auto";
    if (!reset) {
      textAreaRef.current.style.height = `${textAreaRef.current.scrollHeight}px`;
    }
  };

  useEffect(() => adjustTextAreaHeight(), []);

  // Parse various event shapes the Realtime API may emit for transcription
  const handleTranscriptEvent = (evt) => {
    try {
      const msg = JSON.parse(evt.data);

      // Common forms for completed text (names can vary by release):
      const isCompleted =
        msg.type === "input_audio_transcription.completed" ||
        msg.type === "transcription.completed" ||
        msg.type === "conversation.item.input_audio_transcription.completed";

      // Optional: incremental updates if provided by your account
      const isDelta =
        msg.type === "input_audio_transcription.delta" ||
        msg.type === "transcription.delta";

      if (isDelta) {
        const t = msg.delta?.text || msg.text || "";
        if (t) {
          // show partials (non-destructive)
          const preview = (transcriptionRef.current + " " + t).trim();
          setInputText(preview);
          adjustTextAreaHeight();
        }
      }

      if (isCompleted) {
        const text =
          msg.transcript?.text ||
          msg.transcript ||
          msg.text ||
          "";
        if (text) {
          transcriptionRef.current = (transcriptionRef.current + " " + text).trim();
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
    transcriptionRef.current = "";
    setInputText("");
    adjustTextAreaHeight(true);

    // 1) Get ephemeral token from your backend
    const tokenResp = await fetch("/realtime/token", { method: "POST" });
    const tokenJson = await tokenResp.json();
    if (!tokenJson.client_secret) {
      console.error("No client_secret from backend:", tokenJson);
      return;
    }

    // 2) Build WebRTC PeerConnection
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: ["stun:stun.l.google.com:19302"] }],
    });
    pcRef.current = pc;

    // 3) Create a data channel for events
    const dc = pc.createDataChannel("oai-events");
    dc.onmessage = handleTranscriptEvent;
    dataChanRef.current = dc;

    // 4) Mic stream
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaStreamRef.current = stream;
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
        console.warn("PeerConnection state:", pc.connectionState);
      }
    };

    // 5) Create SDP offer
    const offer = await pc.createOffer({
      offerToReceiveAudio: false,  // transcription only; no TTS/audio return
      offerToReceiveVideo: false,
    });
    await pc.setLocalDescription(offer);

    // 6) Exchange SDP with OpenAI using the ephemeral token
    //    Authorization: Bearer <client_secret> (not your real API key)
    const sdpResp = await fetch(REALTIME_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenJson.client_secret}`,
        "Content-Type": "application/sdp",
        "OpenAI-Beta": "realtime=v1",
      },
      body: offer.sdp,
    });

    if (!sdpResp.ok) {
      const txt = await sdpResp.text();
      console.error("SDP exchange failed:", txt);
      return;
    }

    const answerSdp = await sdpResp.text();
    await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

    // 7) Configure transcription session over the data channel (optional;
    //    you already set defaults server-side, but you can tweak here)
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
    dc.readyState === "open"
      ? dc.send(JSON.stringify(sessionUpdate))
      : (dc.onopen = () => dc.send(JSON.stringify(sessionUpdate)));

    setIsRecording(true);
  };

  const stopLiveTranscription = () => {
    try {
      dataChanRef.current?.close();
    } catch {}
    try {
      pcRef.current?.getSenders().forEach((s) => s.track && s.track.stop());
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    } catch {}
    try {
      pcRef.current?.close();
    } catch {}
    dataChanRef.current = null;
    mediaStreamRef.current = null;
    pcRef.current = null;
    setIsRecording(false);
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

