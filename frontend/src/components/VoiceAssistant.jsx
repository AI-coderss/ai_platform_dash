/* eslint-disable no-unused-vars */
import React, { useState, useRef, useEffect } from "react";
import { FaMicrophoneAlt, FaCamera } from "react-icons/fa";
import { motion, AnimatePresence } from "framer-motion";
import AudioWave from "./AudioWave";
import "../styles/VoiceAssistant.css";

const peerConnectionRef = React.createRef();
const dataChannelRef = React.createRef();
const localStreamRef = React.createRef();
const screenStreamRef = React.createRef();
const videoSenderRef = React.createRef();


const VoiceAssistant = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMicActive, setIsMicActive] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false); 
  const [connectionStatus, setConnectionStatus] = useState("idle");
  const [transcript, setTranscript] = useState("");
  const [responseText, setResponseText] = useState("");
  const [remoteStream, setRemoteStream] = useState(null);
  const audioPlayerRef = useRef(null);
  const dragConstraintsRef = useRef(null);

  useEffect(() => {
    if (dragConstraintsRef.current == null) {
      dragConstraintsRef.current = document.body;
    }
  }, []);

  const stopScreenShare = () => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(track => track.stop());
      screenStreamRef.current = null;
    }
    if (videoSenderRef.current && peerConnectionRef.current) {
      try {
        peerConnectionRef.current.removeTrack(videoSenderRef.current);
      } catch (e) {
        console.error("Error removing track:", e);
      }
      videoSenderRef.current = null;
    }
    if (dataChannelRef.current && dataChannelRef.current.readyState === 'open') {
      const sessionUpdate = {
        type: "session.update",
        session: { modalities: ["text", "audio"] } 
      };
      dataChannelRef.current.send(JSON.stringify(sessionUpdate));
      console.log("Sent session.update to disable vision.");
    }
    setIsCameraActive(false);
  };

  const cleanupWebRTC = () => {
    stopScreenShare(); 
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
    setIsCameraActive(false);
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

  // New async function to handle tool calls
  const handleToolCall = async (toolCallMsg) => {
    const { id: tool_call_id, function: func } = toolCallMsg.data.tool_call;
    
    if (func.name === 'vision_frame') {
        console.log(`Tool call received: ${func.name}. Executing...`);
        try {
            const arguments_obj = JSON.parse(func.arguments);
            const response = await fetch("https://ai-platform-dash-voice-chatbot-togglabe.onrender.com/api/execute-vision-tool", {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tool_call_id,
                    arguments: arguments_obj
                })
            });

            if (!response.ok) {
                throw new Error(`Backend tool execution failed: ${response.statusText}`);
            }

            const { result } = await response.json();

            // Send the result back to OpenAI
            const toolRunMsg = {
                type: 'tool.run',
                tool_run: {
                    id: tool_call_id,
                    result: result
                }
            };
            dataChannelRef.current.send(JSON.stringify(toolRunMsg));
            console.log("Sent tool.run result to OpenAI.");

        } catch (error) {
            console.error("Failed to execute tool:", error);
            // Optionally, send an error result back to OpenAI
            const errorRunMsg = {
                type: 'tool.run',
                tool_run: {
                    id: tool_call_id,
                    result: `Error executing tool: ${error.message}`
                }
            };
            dataChannelRef.current.send(JSON.stringify(errorRunMsg));
        }
    }
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
        console.log("✅ Received remote audio track!");
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
      
      // UPDATED onmessage handler
      channel.onmessage = async (event) => {
        const msg = JSON.parse(event.data);
        console.log("<- Received message:", msg);
        switch (msg.type) {
          case "conversation.item.input_audio_transcription.completed":
            setTranscript(msg.transcript);
            setResponseText("");
            break;
          case "response.text.delta":
            setResponseText((prev) => prev + msg.delta);
            break;
          case "response.done":
            console.log("Response finished.");
            setTranscript("");
            break;
          // ADDED CASE for handling tool calls
          case "conversation.item.tool_call.created":
            await handleToolCall(msg);
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

  const toggleCamera = async () => {
    if (connectionStatus !== "connected") return;

    if (isCameraActive) {
      stopScreenShare();
    } else {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        screenStreamRef.current = stream;
        const videoTrack = stream.getVideoTracks()[0];

        videoTrack.onended = () => {
          console.log("Screen sharing stopped by user.");
          stopScreenShare();
        };

        if (peerConnectionRef.current) {
          videoSenderRef.current = peerConnectionRef.current.addTrack(videoTrack, stream);

          const sessionUpdate = {
            type: "session.update",
            session: { modalities: ["text", "audio", "vision"] }
          };
          dataChannelRef.current.send(JSON.stringify(sessionUpdate));
          console.log("Sent session.update to enable vision.");
          setIsCameraActive(true);
        }
      } catch (err) {
        console.error("Could not start screen share:", err);
        stopScreenShare();
      }
    }
  };

  return (
    <>
      {!isOpen && (
        <motion.button className="voice-toggle-btn left" onClick={toggleAssistant}>
          +
        </motion.button>
      )}

      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="voice-sidebar glassmorphic"
            style={{ position: "fixed", top: 100, left: 100, zIndex: 1001, width: '300px' }}
            drag dragConstraints={dragConstraintsRef} dragElastic={0.2}
          >
            <audio ref={audioPlayerRef} style={{ display: "none" }} />
            <div className="voice-header">
              <h3>Voice Assistant</h3>
              <button className="close-btn-green" onClick={toggleAssistant}>✖</button>
            </div>

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
              <button
                className={`mic-btn ${isCameraActive ? "active" : ""}`}
                onClick={toggleCamera}
                disabled={connectionStatus !== "connected"}
              >
                <FaCamera />
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

