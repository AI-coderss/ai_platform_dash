/* eslint-disable no-useless-concat */
/* eslint-disable no-unused-vars */
/* eslint-disable no-unused-vars */
/* eslint-disable no-unused-vars */
import React, { useState, useRef, useEffect } from "react";
import { FaMicrophoneAlt } from "react-icons/fa";
import { motion, AnimatePresence } from "framer-motion";
import AudioWave from "./AudioWave";
import "../styles/VoiceAssistant.css";
import useUiStore from "./store/useUiStore";

/**
 * Voice Assistant with OpenAI Realtime function calling.
 * Listens for response.function_call events on the data channel and executes
 * the requested UI actions, then sends response.function_call_result.
 */

const peerConnectionRef = React.createRef();
const dataChannelRef = React.createRef();
const localStreamRef = React.createRef();

const VOICE_SERVER_URL =
  "https://ai-platform-dash-voice-chatbot-togglabe.onrender.com/api/rtc-connect";

const VoiceAssistant = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMicActive, setIsMicActive] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState("idle");
  const [transcript, setTranscript] = useState("");
  const [responseText, setResponseText] = useState("");
  const [remoteStream, setRemoteStream] = useState(null);
  const audioPlayerRef = useRef(null);
  const dragConstraintsRef = useRef(null); // for dragging

  // Shared UI store flags/actions
  const { hideVoiceBtn, chooseVoice, resetToggles } = useUiStore();

  useEffect(() => {
    if (dragConstraintsRef.current == null) {
      dragConstraintsRef.current = document.body;
    }
  }, []);

  // ----------------- Utilities to talk to ChatBot / App -----------------
  const appNav = {
    navigate: (targetId) => {
      if (window.AppNav?.navigate) return window.AppNav.navigate(targetId);
      // Fallback: DOM event
      window.dispatchEvent(
        new CustomEvent("chatbot:navigate", { detail: { targetId } })
      );
    },
    launch: (appKey) => {
      if (window.ChatBot?.launch) return window.ChatBot.launch(appKey);
      if (window.AppNav?.launch) return window.AppNav.launch(appKey);
      window.dispatchEvent(
        new CustomEvent("chatbot:launch", { detail: { app: appKey } })
      );
    },
    highlight: (name) => {
      if (window.ChatBot?.highlight) return window.ChatBot.highlight(name);
      if (window.AppNav?.highlight) return window.AppNav.highlight(name);
    },
  };

  const chat = {
    open: () => {
      if (window.ChatBot?.open) return window.ChatBot.open();
      window.dispatchEvent(new CustomEvent("chatbot:open"));
    },
    setText: (text) => {
      if (window.ChatBot?.setText) return window.ChatBot.setText(text);
      window.dispatchEvent(
        new CustomEvent("chatbot:setText", { detail: { text } })
      );
    },
    send: (text) => {
      if (window.ChatBot?.sendMessage) return window.ChatBot.sendMessage(text);
      window.dispatchEvent(
        new CustomEvent("chatbot:send", { detail: { text } })
      );
    },
    focus: () => window.ChatBot?.focusInput?.(),
  };

  // ----------------- WebRTC lifecycle -----------------
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
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    setConnectionStatus("idle");
    setIsMicActive(false);
    setTranscript("");
    setResponseText("");

    // When voice session ends, show both controls again
    resetToggles();
  };

  const toggleAssistant = () => {
    setIsOpen((prev) => {
      const opening = !prev;
      if (opening) {
        chooseVoice(); // Hide avatar button while voice is active
        startWebRTC();
      } else {
        cleanupWebRTC();
      }
      return !prev;
    });
  };

  const getLocalToolsSchema = () => {
    // Redundant copy of tools (server already injected in session);
    // sending here via session.update is a safe backup.
    return [
      {
        type: "function",
        name: "navigate",
        description:
          "Navigate to a section (hero/home, products, watch_tutorial, policy, contact, footer).",
        parameters: {
          type: "object",
          properties: {
            target: {
              type: "string",
              enum: [
                "hero",
                "home",
                "products",
                "watch_tutorial",
                "policy",
                "contact",
                "footer",
              ],
            },
          },
          required: ["target"],
        },
      },
      {
        type: "function",
        name: "chat_open",
        description: "Open the on-page chatbot widget and focus the input.",
        parameters: { type: "object", properties: {} },
      },
      {
        type: "function",
        name: "chat_set_text",
        description: "Type text into the chatbot input without sending.",
        parameters: {
          type: "object",
          properties: { text: { type: "string" } },
          required: ["text"],
        },
      },
      {
        type: "function",
        name: "chat_send",
        description:
          "Send a message to the chatbot. If text is omitted, sends the current input.",
        parameters: {
          type: "object",
          properties: { text: { type: "string" } },
        },
      },
      {
        type: "function",
        name: "highlight_card",
        description:
          "Highlight a product card by name (doctor assistant, transcription, analyst, report, ivf, patient).",
        parameters: {
          type: "object",
          properties: { name: { type: "string" } },
          required: ["name"],
        },
      },
      {
        type: "function",
        name: "app_launch",
        description: "Open an app in a new browser tab.",
        parameters: {
          type: "object",
          properties: {
            app: {
              type: "string",
              enum: [
                "doctor",
                "transcript",
                "analyst",
                "report",
                "ivf",
                "patient",
                "survey",
              ],
            },
          },
          required: ["app"],
        },
      },
    ];
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
          audioPlayerRef.current
            .play()
            .catch((e) => console.error("Audio play failed:", e));
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

        // Session update (redundant tools)
        const sessionConfig = {
          type: "session.update",
          session: {
            modalities: ["text", "audio"],
            turn_detection: "vad",
            tools: getLocalToolsSchema(),
          },
        };
        channel.send(JSON.stringify(sessionConfig));

        // Prime a response so the model starts talking back
        const createResponse = {
          type: "response.create",
          response: { modalities: ["text", "audio"] },
        };
        channel.send(JSON.stringify(createResponse));
      };

      // ---- Handle all incoming messages (including function calls) ----
      channel.onmessage = async (event) => {
        const msg = JSON.parse(event.data);
        // console.log("<- Received:", msg);

        switch (msg.type) {
          case "conversation.item.input_audio_transcription.completed":
            setTranscript(msg.transcript);
            setResponseText("");
            break;

          case "response.text.delta":
            setResponseText((prev) => prev + msg.delta);
            break;

          case "response.function_call": {
            // The model is calling one of our declared tools
            const { name, call_id, arguments: args = {} } = msg;
            let result = null;
            let ok = true;

            try {
              result = await handleToolCall(name, args);
            } catch (e) {
              ok = false;
              result = { error: String(e) };
            }

            // Report result back to the model
            const fnResult = {
              type: "response.function_call_result",
              call_id,
              result: { ok, ...(result || {}) },
            };
            channel.send(JSON.stringify(fnResult));
            break;
          }

          case "response.done":
            setTranscript("");
            break;

          default:
            // Other event types are ignored in this simple client
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
        if (state === "failed" || state === "disconnected" || state === "closed") {
          cleanupWebRTC();
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const res = await fetch(VOICE_SERVER_URL, {
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

  // ---- Implement the tool calls (UI actions) ----
  const handleToolCall = async (name, args) => {
    const a = args || {};
    switch (name) {
      case "navigate": {
        const target = normalizeSectionId(a.target);
        if (!target) return { ok: false, error: "Invalid target" };
        appNav.navigate(target);
        return { message: `Navigated to ${target}` };
      }
      case "chat_open": {
        chat.open();
        chat.focus();
        return { message: "Chat opened" };
      }
      case "chat_set_text": {
        const text = String(a.text || "");
        chat.open();
        chat.setText(text);
        chat.focus();
        return { message: "Text set in chat input" };
      }
      case "chat_send": {
        const text = a.text != null ? String(a.text) : undefined;
        chat.open();
        if (text && text.trim()) chat.send(text);
        else chat.send(undefined);
        return { message: "Message sent to chat" };
      }
      case "highlight_card": {
        const name = String(a.name || "");
        appNav.highlight(name);
        appNav.navigate("products");
        return { message: `Highlighted ${name}` };
      }
      case "app_launch": {
        const appKey = String(a.app || "");
        appNav.launch(appKey);
        return { message: `Launched ${appKey}` };
      }
      default:
        return { ok: false, error: `Unknown tool: ${name}` };
    }
  };

  const normalizeSectionId = (raw) => {
    const t = String(raw || "").toLowerCase().trim();
    if (t === "home" || t === "hero") return "hero";
    if (t === "products") return "products";
    if (t === "watch_tutorial" || t === "tutorial") return "watch_tutorial";
    if (t === "policy") return "policy";
    if (t === "contact") return "contact";
    if (t === "footer") return "footer";
    return null;
  };

  const toggleMic = () => {
    if (connectionStatus === "connected" && localStreamRef.current) {
      const nextState = !isMicActive;
      setIsMicActive(nextState);
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = nextState;
      });
    }
  };

  return (
    <>
      {/* Show the floating voice button only if NOT hidden by avatar choice and not already open */}
      {!isOpen && !hideVoiceBtn && (
        <motion.button className="voice-toggle-btn left" onClick={toggleAssistant}>
          +
        </motion.button>
      )}

      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="voice-sidebar glassmorphic"
            style={{ position: "fixed", top: 100, left: 100, zIndex: 1001, width: "300px" }}
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

            <div className="voice-visualizer-container">
              {remoteStream ? (
                <AudioWave stream={remoteStream} />
              ) : (
                <div className="visualizer-placeholder">
                  {connectionStatus === "connected" ? "Listening..." : "Connecting..."}
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

            {/* Compact text UI */}
            <div className="voice-transcript">
              {transcript && (
                <div className="transcript-line">
                  <strong>You:</strong> {transcript}
                </div>
              )}
              {responseText && (
                <div className="transcript-line">
                  <strong>Assistant:</strong> {responseText}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default VoiceAssistant;
