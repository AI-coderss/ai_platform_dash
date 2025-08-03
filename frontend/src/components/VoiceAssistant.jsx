import React, { useState} from "react";
import { FaMicrophoneAlt } from "react-icons/fa";
import { motion } from "framer-motion";
import "../styles/VoiceAssistant.css";

let localStream;

const VoiceAssistant = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMicActive, setIsMicActive] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState("idle");
  const [peerConnection, setPeerConnection] = useState(null);

  const startWebRTC = async () => {
    if (peerConnection || connectionStatus === "connecting") return;

    setConnectionStatus("connecting");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStream = stream;

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });

      stream.getAudioTracks().forEach((track) => pc.addTrack(track, stream));

      const channel = pc.createDataChannel("response");

      channel.onopen = () => {
        setConnectionStatus("connected");
        setIsMicActive(true);
        channel.send(JSON.stringify({ type: "response.create" }));
      };

      channel.onclose = () => {
        setConnectionStatus("idle");
        setIsMicActive(false);
      };

      channel.onerror = () => {
        setConnectionStatus("error");
        setIsMicActive(false);
      };

      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === "failed") {
          pc.close();
          setConnectionStatus("error");
        }
      };

      const offer = await pc.createOffer({ offerToReceiveAudio: true });
      await pc.setLocalDescription(offer);

      const res = await fetch(
        "https://ai-platform-dash-voice-chatbot-togglabe.onrender.com/api/rtc-connect",
        {
          method: "POST",
          headers: { "Content-Type": "application/sdp" },
          body: offer.sdp,
        }
      );

      const answer = await res.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answer });

      setPeerConnection(pc);
    } catch (err) {
      console.error("WebRTC Error:", err);
      setConnectionStatus("error");
    }
  };

  const toggleMic = () => {
    if (connectionStatus === "idle" || connectionStatus === "error") {
      startWebRTC();
    } else if (connectionStatus === "connected" && localStream) {
      const newState = !isMicActive;
      localStream.getAudioTracks().forEach((track) => {
        track.enabled = newState;
      });
      setIsMicActive(newState);
    }
  };

  const toggleAssistant = () => {
    if (!isOpen) startWebRTC();
    setIsOpen(!isOpen);
  };

  return (
    <>
      {!isOpen && (
        <button className="voice-toggle-btn left" onClick={toggleAssistant}>
          ➕
        </button>
      )}

      {isOpen && (
        <motion.div
          className="voice-sidebar glassmorphic"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          drag
          dragConstraints={{ top: -1000, bottom: 1000, left: -1000, right: 1000 }}
          dragElastic={0.2}
          dragTransition={{ bounceStiffness: 300, bounceDamping: 15 }}
          whileTap={{ cursor: "grabbing" }}
          style={{ position: "fixed", top: 100, left: 100, zIndex: 1001 }}
        >
          <div className="voice-header">
            <h3>Voice Assistant</h3>
            <button className="close-btn-green" onClick={toggleAssistant}>
              ✖
            </button>
          </div>

          <div className="voice-controls">
            <button
              className={`mic-btn ${isMicActive ? "active" : ""}`}
              onClick={toggleMic}
              disabled={connectionStatus === "connecting"}
            >
              <FaMicrophoneAlt />
            </button>
            <span className={`status ${connectionStatus}`}>{connectionStatus}</span>
          </div>
        </motion.div>
      )}
    </>
  );
};

export default VoiceAssistant;

