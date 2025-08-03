import React, { useState, useRef } from "react";
import { FaMicrophoneAlt } from "react-icons/fa";
import { motion, AnimatePresence } from "framer-motion";
import "../styles/VoiceAssistant.css";

// Use global refs to hold objects to avoid stale closures
const peerConnectionRef = React.createRef();
const dataChannelRef = React.createRef();
const localStreamRef = React.createRef();

const VoiceAssistant = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMicActive, setIsMicActive] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState("idle");
  const [transcript, setTranscript] = useState("");
  const [responseText, setResponseText] = useState("");
  
  // This audio element will now play the incoming WebRTC stream directly
  const audioPlayerRef = useRef(null);

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
      
      // =================================================================
      // === ✅ KEY CHANGE #1: LISTEN FOR THE INCOMING AUDIO TRACK      ===
      // =================================================================
      pc.ontrack = (event) => {
        console.log("✅ Received remote audio track!");
        if (event.streams && event.streams[0]) {
          const remoteStream = event.streams[0];
          const audioPlayer = audioPlayerRef.current;
          audioPlayer.srcObject = remoteStream;
          audioPlayer.play().catch(e => console.error("Audio play failed:", e));
        }
      };

      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      const channel = pc.createDataChannel("response", { ordered: true });
      dataChannelRef.current = channel;

      channel.onopen = () => {
        console.log("✅ Data channel opened");
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
      
      // =======================================================================
      // === ✅ KEY CHANGE #2: SIMPLIFIED MESSAGE HANDLING (NO AUDIO CHUNKS) ===
      // =======================================================================
      channel.onmessage = async (event) => {
        const msg = JSON.parse(event.data);
        // We keep this log to see all messages from the server
        console.log("<- Received message:", msg);

        switch (msg.type) {
          case "conversation.item.input_audio_transcription.completed":
            setTranscript(msg.transcript);
            setResponseText(""); // Clear previous response
            break;

          case "response.text.delta":
            setResponseText((prev) => prev + msg.delta);
            break;
          
          // The "response.audio.delta" and "response.audio.done" cases are now removed.
          
          case "response.done":
            console.log("Response finished.");
            setTranscript(""); // Clear transcript for the next turn
            break;

          default:
            // No need to log a warning for unhandled types, as many are just informational.
            break;
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
        const state = pc.connectionState;
        console.log(`Connection state changed to: ${state}`);
        if (state === 'failed' || state === 'disconnected' || state === 'closed') {
          cleanupWebRTC();
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      
      const res = await fetch("https://ai-platform-dash-voice-chatbot-togglabe.onrender.com/api/rtc-connect", {
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
      console.log(`Microphone ${nextState ? 'enabled' : 'disabled'}`);
    }
  };

  // The JSX remains the same, but the <audio> element now has a new purpose.
  return (
    <>
      {!isOpen && (
        <motion.button
          className="voice-toggle-btn left"
          onClick={toggleAssistant}
          //... other motion props
        >
          ➕
        </motion.button>
      )}

      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="voice-sidebar glassmorphic"
            //... other motion props
            style={{ position: "fixed", top: 100, left: 100, zIndex: 1001, width: '300px' }}
          >
            {/* This audio element now plays the direct stream via srcObject */}
            <audio ref={audioPlayerRef} style={{ display: "none" }} />
            <div className="voice-header">
              <h3>Voice Assistant</h3>
              <button className="close-btn-green" onClick={toggleAssistant}>
                ✖
              </button>
            </div>
            
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


