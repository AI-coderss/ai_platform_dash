import React, { useState, useRef, useEffect } from "react";
import { FaMicrophoneAlt } from "react-icons/fa";
import { motion, AnimatePresence } from "framer-motion";
import "../styles/VoiceAssistant.css";

const VoiceAssistant = () => {
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [micStream, setMicStream] = useState(null);
  const [isMicActive, setIsMicActive] = useState(false);
  const [peerConnection, setPeerConnection] = useState(null);
  const [dataChannel, setDataChannel] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState("idle");
  const audioPlayerRef = useRef(null);

  const startWebRTC = async () => {
    if (peerConnection || connectionStatus === "connecting") return;

    setConnectionStatus("connecting");
    setIsMicActive(false);

    const pc = new RTCPeerConnection();
    setPeerConnection(pc);

    pc.ontrack = (event) => {
      const audioStream = event.streams[0];
      if (audioPlayerRef.current && audioStream) {
        audioPlayerRef.current.srcObject = audioStream;
        audioPlayerRef.current.muted = false;
        audioPlayerRef.current.play().catch(console.error);
      }
    };

    const channel = pc.createDataChannel("response");
    setDataChannel(channel);

    channel.onopen = () => {
      setConnectionStatus("connected");
      setIsMicActive(true);
      micStream?.getAudioTracks().forEach((track) => (track.enabled = true));
    };

    channel.onclose = () => {
      setConnectionStatus("idle");
      setIsMicActive(false);
    };

    channel.onerror = (error) => {
      console.error("DataChannel error:", error);
      setConnectionStatus("error");
      setIsMicActive(false);
    };

    channel.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      // eslint-disable-next-line default-case
      switch (msg.type) {
        case "response.audio_transcript.delta":
          console.log("Streaming transcript...");
          break;
        case "output_audio_buffer.stopped":
          break;
      }
    };

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getAudioTracks().forEach((track) => (track.enabled = false));
      setMicStream(stream);

      stream.getAudioTracks().forEach((track) =>
        pc.addTransceiver(track, { direction: "sendrecv" })
      );

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const res = await fetch("https://ai-platform-dash-voice-chatbot-togglabe.onrender.com/api/rtc-connect", {
        method: "POST",
        headers: { "Content-Type": "application/sdp" },
        body: offer.sdp,
      });

      const answer = await res.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answer });
    } catch (err) {
      console.error("WebRTC error:", err);
      setConnectionStatus("error");
      setIsMicActive(false);
    }
  };

  const toggleMic = () => {
    if (connectionStatus === "idle" || connectionStatus === "error") {
      startWebRTC();
      return;
    }

    if (connectionStatus === "connected" && micStream) {
      const newMicState = !isMicActive;
      setIsMicActive(newMicState);
      micStream.getAudioTracks().forEach((track) => {
        track.enabled = newMicState;
      });
    }
  };

  useEffect(() => {
    return () => {
      micStream?.getTracks().forEach((track) => track.stop());
      peerConnection?.close();
      dataChannel?.close();
      setMicStream(null);
      setPeerConnection(null);
      setDataChannel(null);
      setConnectionStatus("idle");
      setIsMicActive(false);
    };
  }, [dataChannel, micStream, peerConnection]);

  return (
    <AnimatePresence>
      {!isVoiceMode && (
        <motion.button
          className="voice-toggle-btn left"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => setIsVoiceMode(true)}
        >
          ➕
        </motion.button>
      )}

      {isVoiceMode && (
        <motion.div
          className="voice-sidebar glassmorphic"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ duration: 0.3 }}
          drag
          dragConstraints={{ top: -1000, bottom: 1000, left: -1000, right: 1000 }}
          dragElastic={0.3}
          dragTransition={{ bounceStiffness: 200, bounceDamping: 12 }}
          style={{ position: "fixed", top: 120, left: 120, zIndex: 1001, width: 250, height: 150 }}
        >
          <audio ref={audioPlayerRef} style={{ display: "none" }} playsInline autoPlay />
          <div className="voice-header">
            <h3>Voice Assistant</h3>
            <button className="close-btn-green" onClick={() => setIsVoiceMode(false)}>
              ✖
            </button>
          </div>

          <div className="voice-controls">
            {connectionStatus === "connecting" && (
              <div className="connection-status connecting">🔄 Connecting...</div>
            )}
            <button
              className={`mic-icon-btn ${isMicActive ? "active" : ""}`}
              onClick={toggleMic}
              disabled={connectionStatus === "connecting"}
            >
              <FaMicrophoneAlt />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default VoiceAssistant;





