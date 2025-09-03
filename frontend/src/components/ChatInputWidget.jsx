/* eslint-disable no-const-assign */
import React, { useEffect, useRef, useState } from "react";
import SendIcon from "@mui/icons-material/Send";
import MicIcon from "@mui/icons-material/Mic";
import StopIcon from "@mui/icons-material/Stop";
import "../styles/ChatInputWidget.css";

const REALTIME_SDP_URL = "https://api.openai.com/v1/realtime?model=gpt-4o-transcribe";

const ChatInputWidget = ({ onSendMessage }) => {
  const [inputText, setInputText] = useState("");
  const [isRecording, setIsRecording] = useState(false);

  const textAreaRef = useRef(null);
  const transcriptionRef = useRef("");
  const pcRef = useRef(null);
  const dcRef = useRef(null);
  const mediaStreamRef = useRef(null);

  const adjustTextAreaHeight = (reset = false) => {
    if (!textAreaRef.current) return;
    textAreaRef.current.style.height = "auto";
    if (!reset) {
      textAreaRef.current.style.height = `${textAreaRef.current.scrollHeight}px`;
    }
  };
  useEffect(() => adjustTextAreaHeight(), []);

  // Wait until ICE gathering completes so our SDP has candidates
  const waitForIceGatheringComplete = (pc) =>
    new Promise((resolve) => {
      if (pc.iceGatheringState === "complete") return resolve();
      const check = () => {
        if (pc.iceGatheringState === "complete") {
          pc.removeEventListener("icegatheringstatechange", check);
          resolve();
        }
      };
      pc.addEventListener("icegatheringstatechange", check);
      setTimeout(resolve, 1500); // safety timeout
    });

  const handleTranscriptEvent = (evt) => {
    try {
      const msg = JSON.parse(evt.data);

      const isDelta =
        msg.type === "input_audio_transcription.delta" ||
        msg.type === "transcription.delta";

      const isCompleted =
        msg.type === "input_audio_transcription.completed" ||
        msg.type === "transcription.completed" ||
        msg.type === "conversation.item.input_audio_transcription.completed";

      if (isDelta) {
        const t = msg.delta?.text || msg.text || "";
        if (t) {
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
      // Ignore non-JSON frames
    }
  };

  const startLiveTranscription = async () => {
    // 1) Get short-lived token from your backend
    const r = await fetch("/realtime/token", { method: "POST" });
    const { client_secret } = await r.json();
    if (!client_secret) {
      console.error("No client_secret from backend");
      return;
    }

    // Reset UI
    transcriptionRef.current = "";
    setInputText("");
    adjustTextAreaHeight(true);

    // 2) Build WebRTC peer connection
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: ["stun:stun.l.google.com:19302"] }],
    });
    pcRef.current = pc;

    // For debugging
    pc.oniceconnectionstatechange = () =>
      console.log("ICE state:", pc.iceConnectionState);

    // 3) Data channel for events (transcripts)
    const dc = pc.createDataChannel("oai-events");
    dc.onmessage = handleTranscriptEvent;
    dcRef.current = dc;

    // 4) Mic
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaStreamRef.current = stream;
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));

    // 5) Offer → wait for ICE → POST to OpenAI with ephemeral token
    const offer = await pc.createOffer({ offerToReceiveAudio: false, offerToReceiveVideo: false });
    await pc.setLocalDescription(offer);
    await waitForIceGatheringComplete(pc);

    const sdpResp = await fetch(REALTIME_SDP_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${client_secret}`,  // ephemeral
        "Content-Type": "application/sdp",
        "OpenAI-Beta": "realtime=v1",
      },
      body: pc.localDescription.sdp,
    });
    if (!sdpResp.ok) {
      console.error("SDP exchange failed:", await sdpResp.text());
      return;
    }
    const answerSdp = await sdpResp.text();
    await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

    // 6) Optional: refine session config at runtime
    const sessionUpdate = {
      type: "transcription_session.update",
      input_audio_format: "pcm16",
      input_audio_transcription: { model: "gpt-4o-transcribe" },
      turn_detection: {
        type: "server_vad",
        threshold: 0.5,
        prefix_padding_ms: 300,
        silence_duration_ms: 500
      },
      input_audio_noise_reduction: { type: "near_field" },
      include: ["item.input_audio_transcription.logprobs"],
    };
    if (dc.readyState === "open") dc.send(JSON.stringify(sessionUpdate));
    else dc.onopen = () => dc.send(JSON.stringify(sessionUpdate));

    setIsRecording(true);
  };

  const stopLiveTranscription = () => {
    try { dcRef.current?.close(); } catch {}
    try {
      pcRef.current?.getSenders().forEach((s) => s.track && s.track.stop());
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    } catch {}
    try { pcRef.current?.close(); } catch {}
    dcRef.current = null;
    mediaStreamRef = null;
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
    if (inputText.trim()) handleSendMessage();
    else isRecording ? stopLiveTranscription() : startLiveTranscription();
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

