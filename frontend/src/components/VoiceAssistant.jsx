/* eslint-disable no-unused-vars */
import React, { useState, useRef } from "react";
import { FaMicrophoneAlt } from "react-icons/fa";
import { motion, AnimatePresence } from "framer-motion";
import "../styles/VoiceAssistant.css";

let localStream;

const VoiceAssistant = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMicActive, setIsMicActive] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState("idle");
  const [peerConnection, setPeerConnection] = useState(null);
  const [dataChannel, setDataChannel] = useState(null);
  const audioPlayerRef = useRef(null);
  const pcmBufferRef = useRef(new ArrayBuffer(0));

  const toggleAssistant = () => {
    if (!isOpen) startWebRTC();
    setIsOpen(!isOpen);
  };

  const startWebRTC = async () => {
    if (peerConnection || connectionStatus === "connecting") return;

    setConnectionStatus("connecting");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStream = stream;

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });

      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      const channel = pc.createDataChannel("response");
      setDataChannel(channel);

      channel.onopen = () => {
        setConnectionStatus("connected");
        setIsMicActive(true);
        channel.send(JSON.stringify({ type: "response.create" }));
      };

      channel.onmessage = async (event) => {
        const msg = JSON.parse(event.data);
        switch (msg.type) {
          case "response.audio.delta": {
            const chunk = Uint8Array.from(atob(msg.delta), c => c.charCodeAt(0));
            const newBuffer = new Uint8Array(pcmBufferRef.current.byteLength + chunk.byteLength);
            newBuffer.set(new Uint8Array(pcmBufferRef.current), 0);
            newBuffer.set(chunk, pcmBufferRef.current.byteLength);
            pcmBufferRef.current = newBuffer.buffer;
            break;
          }

          case "response.audio.done": {
            const wav = pcmBufferRef.current;
            const blob = new Blob([wav], { type: "audio/wav" });
            const url = URL.createObjectURL(blob);
            const el = audioPlayerRef.current;
            el.src = url;
            el.volume = 1;
            el.muted = false;
            el.play();
            pcmBufferRef.current = new ArrayBuffer(0);
            break;
          }

          default:
            console.warn("Unhandled message type:", msg.type);
        }
      };

      channel.onerror = (e) => {
        console.error("Data channel error", e);
        setConnectionStatus("error");
      };

      channel.onclose = () => {
        setConnectionStatus("idle");
        setIsMicActive(false);
      };

      const offer = await pc.createOffer({ offerToReceiveAudio: true });
      await pc.setLocalDescription(offer);

      const res = await fetch("https://ai-platform-dash-voice-chatbot-togglabe.onrender.com/api/rtc-connect", {
        method: "POST",
        headers: { "Content-Type": "application/sdp" },
        body: offer.sdp,
      });

      const answer = await res.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answer });

      setPeerConnection(pc);
    } catch (err) {
      console.error("WebRTC error:", err);
      setConnectionStatus("error");
    }
  };

  const toggleMic = () => {
    if (connectionStatus === "idle" || connectionStatus === "error") {
      startWebRTC();
    } else if (connectionStatus === "connected" && localStream) {
      const newState = !isMicActive;
      setIsMicActive(newState);
      localStream.getTracks().forEach((track) => (track.enabled = newState));
    }
  };

  return (
    <>
      {!isOpen && (
        <motion.button
          className="voice-toggle-btn left"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          whileTap={{ scale: 0.9 }}
          onClick={toggleAssistant}
        >
          ➕
        </motion.button>
      )}

      <AnimatePresence>
        {isOpen && (
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
            style={{ position: "fixed", top: 100, left: 100, zIndex: 1001 }}
          >
            <audio ref={audioPlayerRef} style={{ display: "none" }} playsInline autoPlay />
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
      </AnimatePresence>
    </>
  );
};

export default VoiceAssistant;




