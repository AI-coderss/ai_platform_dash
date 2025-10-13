/* eslint-disable no-unused-vars */
import React, { useState, useRef, useEffect } from "react";
import { FaMicrophoneAlt } from "react-icons/fa";
import { motion, AnimatePresence } from "framer-motion";
import AudioWave from "./AudioWave";
import "../styles/VoiceAssistant.css";

/** 
 * You can pass voiceApiBase & visitorId from App; 
 * fallback to localStorage visitor id if missing.
 */
const VoiceAssistant = ({ voiceApiBase = "", visitorId: propVisitorId }) => {
  const peerConnectionRef = useRef(null);
  const dataChannelRef = useRef(null);
  const localStreamRef = useRef(null);

  const [isOpen, setIsOpen] = useState(false);
  const [isMicActive, setIsMicActive] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState("idle");
  const [transcript, setTranscript] = useState("");
  const [responseText, setResponseText] = useState("");
  const [remoteStream, setRemoteStream] = useState(null);
  const [focusApp, setFocusApp] = useState(null); // NEW: show current hover focus
  const audioPlayerRef = useRef(null);
  const dragConstraintsRef = useRef(null);

  // get visitor id
  const visitorId = propVisitorId || localStorage.getItem("dsah_visitor_id") || "";

  useEffect(() => {
    if (dragConstraintsRef.current == null) {
      dragConstraintsRef.current = document.body;
    }
  }, []);

  // Listen for structured prompt event to show focus
  useEffect(() => {
    const onHoverPrompt = (e) => {
      const detail = e.detail || {};
      setFocusApp(detail.app || null);
    };
    window.addEventListener("app-hover-prompt", onHoverPrompt);
    return () => window.removeEventListener("app-hover-prompt", onHoverPrompt);
  }, []);

  const cleanupWebRTC = () => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (dataChannelRef.current) {
      dataChannelRef.current.close();
      dataChannelRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    setConnectionStatus("idle");
    setIsMicActive(false);
    setTranscript("");
    setResponseText("");
  };

  const toggleAssistant = () => {
    setIsOpen(prev => {
      if (!prev) {
        startWebRTC();
      } else {
        cleanupWebRTC();
      }
      return !prev;
    });
  };

  const startWebRTC = async () => {
    if (peerConnectionRef.current || connectionStatus === "connecting") return;
    setConnectionStatus("connecting");
    setResponseText("Connecting to assistant...");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });
      peerConnectionRef.current = pc;

      pc.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
          const stream = event.streams[0];
          audioPlayerRef.current.srcObject = stream;
          audioPlayerRef.current.play().catch(e => console.error("Audio play failed:", e));
          setRemoteStream(stream);
        }
      };

      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      const channel = pc.createDataChannel("response", { ordered: true });
      dataChannelRef.current = channel;

      channel.onopen = () => {
        setConnectionStatus("connected");
        setResponseText("Connected! Speak now...");
        setIsMicActive(true);

        const sessionConfig = {
          type: "session.update",
          session: { modalities: ["text", "audio"], turn_detection: "vad" },
        };
        channel.send(JSON.stringify(sessionConfig));

        const createResponse = {
          type: "response.create",
          response: { modalities: ["text", "audio"] },
        };
        channel.send(JSON.stringify(createResponse));
      };

      channel.onmessage = async (event) => {
        const msg = JSON.parse(event.data);
        switch (msg.type) {
          case "conversation.item.input_audio_transcription.completed":
            setTranscript(msg.transcript);
            setResponseText("");
            break;
          case "response.text.delta":
            setResponseText((prev) => prev + msg.delta);
            break;
          case "response.done":
            setTranscript("");
            break;
          default:
            break;
        }
      };

      channel.onerror = (e) => {
        console.error("Data channel error", e);
        setConnectionStatus("error");
        setResponseText("Connection error.");
      };

      channel.onclose = () => {
        cleanupWebRTC();
      };

      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        if (state === 'failed' || state === 'disconnected' || state === 'closed') {
          cleanupWebRTC();
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // Pass visitorId so backend injects hover-context instructions
      const url = `${voiceApiBase || ""}/api/rtc-connect${visitorId ? `?visitorId=${encodeURIComponent(visitorId)}` : ""}`;

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/sdp" },
        body: offer.sdp,
      });

      if (!res.ok) throw new Error(`Server responded with ${res.status}`);

      const answer = await res.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answer });

    } catch (err) {
      console.error("WebRTC error:", err);
      setConnectionStatus("error");
      setResponseText("Failed to start session.");
      cleanupWebRTC();
    }
  };

  const toggleMic = () => {
    if (connectionStatus === "connected" && localStreamRef.current) {
      const nextState = !isMicActive;
      setIsMicActive(nextState);
      localStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = nextState;
      });
    }
  };

  return (
    <>
      {!isOpen && (
        <motion.button
          className="voice-toggle-btn left"
          onClick={toggleAssistant}
        >
          +
        </motion.button>
      )}

      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="voice-sidebar glassmorphic"
            style={{ position: "fixed", top: 100, left: 100, zIndex: 1001, width: '300px' }}
            drag
            dragConstraints={dragConstraintsRef}
            dragElastic={0.2}
          >
            <audio ref={audioPlayerRef} style={{ display: "none" }} />
            <div className="voice-header">
              <h3>Voice Assistant</h3>
              <button className="close-btn-green" onClick={toggleAssistant}>
                ✖
              </button>
            </div>

            {/* Current focus pill from hover (nice UX touch) */}
            {focusApp && (
              <div style={{
                margin: "6px 12px 0",
                fontSize: 12,
                color: "#0f172a",
                background: "#e2f3ff",
                border: "1px solid #cde9ff",
                padding: "4px 8px",
                borderRadius: 999,
                maxWidth: "100%",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}>
                Primed for: {focusApp.name}
              </div>
            )}

            <div className="voice-visualizer-container">
              {remoteStream ? (
                <AudioWave stream={remoteStream} />
              ) : (
                <div className="visualizer-placeholder">
                  {connectionStatus === 'connected' ? 'Listening...' : 'Connecting...'}
                </div>
              )}
            </div>

            <div className="voice-controls">
              <button
                className={`mic-btn ${isMicActive ? "active" : ""}`}
                onClick={toggleMic}
                disabled={connectionStatus !== "connected"}
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



