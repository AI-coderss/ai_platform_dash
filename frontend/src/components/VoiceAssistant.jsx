/* eslint-disable no-unused-vars */
import React, { useState, useRef, useEffect } from "react";
import { FaMicrophoneAlt } from "react-icons/fa";
import { motion, AnimatePresence } from "framer-motion";
import "../styles/VoiceAssistant.css";

// Use a global ref to hold the peer connection to avoid stale closures
const peerConnectionRef = React.createRef();
const dataChannelRef = React.createRef();
const localStreamRef = React.createRef();

const VoiceAssistant = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMicActive, setIsMicActive] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState("idle");
  
  // New state for real-time feedback
  const [transcript, setTranscript] = useState("");
  const [responseText, setResponseText] = useState("");
  
  const audioPlayerRef = useRef(null);
  const pcmBufferRef = useRef(new ArrayBuffer(0));

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

      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      const channel = pc.createDataChannel("response", { ordered: true });
      dataChannelRef.current = channel;

      // === KEY CHANGE: SETUP DATA CHANNEL WITH FULL LOGIC ===
      channel.onopen = () => {
        console.log("✅ Data channel opened");
        setConnectionStatus("connected");
        setResponseText("Connected! Speak now...");
        setIsMicActive(true);
        
        // 1. Configure the session (imitating your working example)
        const sessionConfig = {
          type: "session.update",
          session: {
            modalities: ["text", "audio"],
            turn_detection: "vad", // Using Voice Activity Detection
          },
        };
        console.log("-> Sending session config:", sessionConfig);
        channel.send(JSON.stringify(sessionConfig));

        // 2. Request the initial response
        const createResponse = {
          type: "response.create",
          response: {
            modalities: ["text", "audio"],
          },
        };
        console.log("-> Sending response create:", createResponse);
        channel.send(JSON.stringify(createResponse));
      };
      
      // === KEY CHANGE: EXPANDED MESSAGE HANDLING ===
      channel.onmessage = async (event) => {
        const msg = JSON.parse(event.data);
        console.log("<- Received message:", msg);

        switch (msg.type) {
          case "conversation.item.input_audio_transcription.completed":
            setTranscript(msg.transcript);
            // Clear previous response when new transcript is final
            setResponseText("");
            break;

          case "response.text.delta":
            setResponseText((prev) => prev + msg.delta);
            break;

          case "response.audio.delta": {
             // Your existing logic for handling audio chunks is correct
            const chunk = Uint8Array.from(atob(msg.delta), (c) => c.charCodeAt(0));
            const newBuffer = new Uint8Array(pcmBufferRef.current.byteLength + chunk.byteLength);
            newBuffer.set(new Uint8Array(pcmBufferRef.current), 0);
            newBuffer.set(chunk, pcmBufferRef.current.byteLength);
            pcmBufferRef.current = newBuffer.buffer;
            break;
          }

          case "response.audio.done": {
             // Your existing logic for playing the final audio is correct
            const wavData = pcmBufferRef.current;
            if (wavData.byteLength === 0) {
              console.warn("Received audio.done but buffer is empty.");
              return;
            }
            const blob = new Blob([wavData], { type: "audio/wav" });
            const url = URL.createObjectURL(blob);
            const el = audioPlayerRef.current;
            el.src = url;
            el.play().catch(e => console.error("Audio play failed:", e));
            
            // Reset for the next response
            pcmBufferRef.current = new ArrayBuffer(0);
            setTranscript(""); 
            break;
          }
            
          case "response.done":
            console.log("Response finished.");
            // You might want to re-enable the mic or wait for the next turn
            break;

          default:
            console.warn("Unhandled message type:", msg.type);
        }
      };

      channel.onerror = (e) => {
        console.error("Data channel error", e);
        setConnectionStatus("error");
        setResponseText("Connection error.");
      };

      channel.onclose = () => {
        console.log("Data channel closed");
        cleanupWebRTC();
      };
      
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected' || pc.connectionState === 'closed') {
          cleanupWebRTC();
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      
      // The SDP offer/answer with your Flask proxy is correct
      const res = await fetch("https://ai-platform-dash-voice-chatbot-togglabe.onrender.com/api/rtc-connect", {
        method: "POST",
        headers: { "Content-Type": "application/sdp" },
        body: offer.sdp,
      });

      if (!res.ok) {
        throw new Error(`Server responded with ${res.status}`);
      }
      
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
    // This function can now be simpler, primarily for manual muting if needed
    if (connectionStatus === "connected" && localStreamRef.current) {
        const nextState = !isMicActive;
        setIsMicActive(nextState);
        localStreamRef.current.getAudioTracks().forEach(track => {
            track.enabled = nextState;
        });
        console.log(`Microphone ${nextState ? 'enabled' : 'disabled'}`);
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
            style={{ position: "fixed", top: 100, left: 100, zIndex: 1001, width: '300px' }}
          >
            <audio ref={audioPlayerRef} style={{ display: "none" }} playsInline />
            <div className="voice-header">
              <h3>Voice Assistant</h3>
              <button className="close-btn-green" onClick={toggleAssistant}>
                ✖
              </button>
            </div>
            
            {/* Added UI for feedback */}
            <div className="voice-feedback">
                <div className="transcript-container">
                    <strong>You said:</strong>
                    <p>"{transcript || '...'}"</p>
                </div>
                <div className="response-container">
                    <strong>Assistant:</strong>
                    <p>{responseText || '...'}</p>
                </div>
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



