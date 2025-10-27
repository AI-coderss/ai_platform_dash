/* eslint-disable no-useless-concat */
/* eslint-disable no-unused-vars */
/* eslint-disable no-unused-vars */
/* eslint-disable no-useless-concat */
/* eslint-disable no-unused-vars */
import React, { useState, useRef, useEffect } from "react";
import { FaMicrophoneAlt } from "react-icons/fa";
import { motion, AnimatePresence } from "framer-motion";
import AudioWave from "./AudioWave";
import "../styles/VoiceAssistant.css";
import useUiStore from "./store/useUiStore";

const peerConnectionRef = React.createRef();
const dataChannelRef = React.createRef();
const localStreamRef = React.createRef();

/**
 * Agent-safe, whitelisted sections the model is allowed to navigate to.
 * Keep this list consistent with the backend tool enum.
 */
const ALLOWED_SECTIONS = new Set([
  "home", "products", "policy", "watch_tutorial", "contact", "footer",
  "chat",
  "doctor", "transcription", "analyst", "report", "ivf", "patient", "survey",
]);

/**
 * Whitelisted clickable control ids (data-agent-id values).
 * Add/remove as your UI evolves. These exist in App.jsx (top nav + product cards).
 */
const ALLOWED_CONTROL_IDS = new Set([
  // Top nav
  "nav.about",
  "nav.products",
  "nav.policy",
  "nav.watch_tutorial",
  "nav.contact",
  "nav.footer",

  // Product launches
  "products.launch:doctor",
  "products.launch:transcription",
  "products.launch:analyst",
  "products.launch:report",
  "products.launch:ivf",
  "products.launch:patient",
  "products.launch:survey",

  // Product help buttons
  "products.help:doctor",
  "products.help:transcription",
  "products.help:analyst",
  "products.help:report",
  "products.help:ivf",
  "products.help:patient",
  "products.help:survey",

  // Contact submit (optional, if ever used via click_control)
  "contact.submit",
]);

/** Tool schemas sent to the Realtime session via session.update (mirrors backend). */
const TOOL_SCHEMAS = [
  {
    type: "function",
    name: "navigate_to",
    description: "Navigate the platform to an allowed section or open a specific product/app.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        section: {
          type: "string",
          description: "One of the allowed section names.",
          enum: Array.from(ALLOWED_SECTIONS),
        },
      },
      required: ["section"],
    },
  },
  {
    type: "function",
    name: "click_control",
    description:
      "Click a whitelisted UI control by its data-agent-id. Use ONLY ids you have been told are available.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        control_id: {
          type: "string",
          description:
            "A safe, whitelisted control id like 'products.launch:doctor' or 'nav.products'.",
        },
      },
      required: ["control_id"],
    },
  },
  {
    type: "function",
    name: "chat_ask",
    description: "Type a message into the platform's chatbot and submit.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        text: {
          type: "string",
          minLength: 1,
          maxLength: 500,
          description: "The exact message to send into the on-platform chatbot.",
        },
      },
      required: ["text"],
    },
  },
  // 🔥 New: Contact form tools
  {
    type: "function",
    name: "contact_fill",
    description:
      "Fill the contact form fields (name, email, recipient, message). Any field may be omitted to partially fill.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        name: { type: "string" },
        email: { type: "string" },
        recipient: { type: "string" },
        message: { type: "string" },
      },
    },
  },
  {
    type: "function",
    name: "contact_submit",
    description: "Submit the contact form after required fields are present.",
    parameters: { type: "object", additionalProperties: false, properties: {} },
  },
];

const VoiceAssistant = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMicActive, setIsMicActive] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState("idle");
  const [transcript, setTranscript] = useState("");
  const [responseText, setResponseText] = useState("");
  const [remoteStream, setRemoteStream] = useState(null);
  const audioPlayerRef = useRef(null);
  const dragConstraintsRef = useRef(null); // for dragging

  // ⬇️ NEW: shared UI store flags/actions
  const { hideVoiceBtn, chooseVoice, resetToggles } = useUiStore();

  // Buffer of streaming tool-call arguments by id
  const toolBuffersRef = useRef(new Map());
  // Small dedupe window for clicks
  const recentClicksRef = useRef(new Map());

  useEffect(() => {
    if (dragConstraintsRef.current == null) {
      dragConstraintsRef.current = document.body;
    }
  }, []);

  const cleanupWebRTC = () => {
    if (peerConnectionRef.current) {
      try { peerConnectionRef.current.close(); } catch {}
      peerConnectionRef.current = null;
    }
    if (dataChannelRef.current) {
      try { dataChannelRef.current.close(); } catch {}
      dataChannelRef.current = null;
    }
    if (localStreamRef.current) {
      try { localStreamRef.current.getTracks().forEach(track => track.stop()); } catch {}
      localStreamRef.current = null;
    }
    setConnectionStatus("idle");
    setIsMicActive(false);
    setTranscript("");
    setResponseText("");

    // ⬇️ When voice session ends, show both controls again
    resetToggles();
  };

  const toggleAssistant = () => {
    setIsOpen(prev => {
      const opening = !prev;
      if (opening) {
        chooseVoice();      // ⬅️ Hide the *avatar* button
        startWebRTC();
      } else {
        cleanupWebRTC();    // resets UI toggles to visible
      }
      return !prev;
    });
  };

  const sendSessionUpdate = () => {
    const ch = dataChannelRef.current;
    if (!ch || ch.readyState !== "open") return;

    const instruction =
      "You are the Instructional Chatbot voice assistant for the DSAH AI platform. " +
      "Speak briefly. When the user asks to open sections, click specific buttons, ask the on-site chatbot a question, " +
      "or send an email via the Contact section, use the appropriate tool (navigate_to, click_control, chat_ask, contact_fill, contact_submit). " +
      "Only use allowed sections and whitelisted control ids. " +
      "For email: collect name, email, recipient (optional), and the message. Ask for missing items; " +
      "when ready call contact_fill with what you have, then contact_submit.";

    const msg = {
      type: "session.update",
      session: {
        voice: "alloy",
        modalities: ["text", "audio"],
        turn_detection: { type: "server_vad" },
        tools: TOOL_SCHEMAS,
        tool_choice: { type: "auto" },
        instructions: instruction,
      },
    };
    try {
      ch.send(JSON.stringify(msg));
    } catch (e) {
      console.warn("session.update send failed:", e);
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
        if (event.streams && event.streams[0]) {
          const stream = event.streams[0];
          if (audioPlayerRef.current) {
            audioPlayerRef.current.srcObject = stream;
            audioPlayerRef.current
              .play()
              .catch(e => console.error("Audio play failed:", e));
          }
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

        try {
          channel.send(JSON.stringify({
            type: "response.create",
            response: { modalities: ["text", "audio"] },
          }));
        } catch {}

        // Prime tool schemas/instructions
        sendSessionUpdate();
      };

      channel.onmessage = async (event) => {
        let msg;
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }

        // ---- Standard text/ASR messages ----
        switch (msg.type) {
          case "conversation.item.input_audio_transcription.completed":
            setTranscript(msg.transcript || "");
            setResponseText("");
            break;
          case "response.text.delta":
            setResponseText((prev) => prev + (msg.delta || ""));
            break;
          case "response.done":
            setTranscript("");
            break;
          default:
            break;
        }

        // ---- Tool call lifecycle (delta buffering → done → dispatch) ----
        if (msg.type === "response.output_item.added" && msg.item?.type === "function_call") {
          const id = msg.item.call_id || msg.item.id || "default";
          const name = msg.item.name || "";
          const prev = toolBuffersRef.current.get(id) || { name: "", argsText: "" };
          prev.name = name || prev.name;
          toolBuffersRef.current.set(id, prev);
          return;
        }

        if (msg.type === "response.function_call_arguments.delta" || msg.type === "tool_call.delta") {
          const id = msg.call_id || msg.id || "default";
          const delta = msg.delta || msg.arguments_delta || "";
          const prev = toolBuffersRef.current.get(id) || { name: "", argsText: "" };
          prev.argsText += (delta || "");
          toolBuffersRef.current.set(id, prev);
          return;
        }

        if (
          msg.type === "response.function_call_arguments.done" ||
          msg.type === "tool_call_arguments.done" ||
          msg.type === "response.function_call.completed" ||
          msg.type === "tool_call.completed"
        ) {
          const id = msg.call_id || msg.id || "default";
          const buf = toolBuffersRef.current.get(id);
          toolBuffersRef.current.delete(id);
          if (!buf) return;

          const name = buf.name || "unknown_tool";
          let args = {};
          try {
            args = JSON.parse(buf.argsText || "{}");
          } catch (e) {
            console.warn("Failed parsing tool args:", e, buf.argsText);
          }
          handleToolCall(name, args);
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

      const offer = await pc.createOffer({ offerToReceiveAudio: true });
      // Opus tuning (optional)
      offer.sdp = offer.sdp.replace(
        /a=rtpmap:\d+ opus\/48000\/2/g,
        "a=rtpmap:111 opus/48000/2\r\n" + "a=fmtp:111 minptime=10;useinbandfec=1"
      );
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

  // ---- Tool execution handlers ----
  const handleToolCall = (name, args) => {
    if (!name) return;

    if (name === "navigate_to") {
      const section = String(args?.section || "").trim();
      if (!ALLOWED_SECTIONS.has(section)) return;
      if (window.agentNavigate && typeof window.agentNavigate === "function") {
        try { window.agentNavigate(section); } catch {}
      } else {
        window.dispatchEvent(new CustomEvent("agent:navigate", { detail: { section } }));
      }
      return;
    }

    if (name === "click_control") {
      const id = String(args?.control_id || "").trim();
      if (!ALLOWED_CONTROL_IDS.has(id)) return;
      const now = Date.now();
      const last = recentClicksRef.current.get(id) || 0;
      if (now - last < 400) return;
      recentClicksRef.current.set(id, now);

      const el = document.querySelector(`[data-agent-id="${CSS.escape(id)}"]`);
      if (el) {
        try { el.scrollIntoView({ behavior: "smooth", block: "center" }); } catch {}
        try { el.focus({ preventScroll: true }); } catch {}
        try { el.click(); } catch {}
      }
      return;
    }

    if (name === "chat_ask") {
      const text = String(args?.text || "").trim();
      if (!text) return;
      if (window.ChatBotBridge && typeof window.ChatBotBridge.sendMessage === "function") {
        try { window.ChatBotBridge.sendMessage(text); } catch {}
      } else {
        window.dispatchEvent(new CustomEvent("agent:chat.ask", { detail: { text } }));
      }
      return;
    }

    // 🔥 Contact form tools
    if (name === "contact_fill") {
      const payload = {
        name: typeof args?.name === "string" ? args.name : undefined,
        email: typeof args?.email === "string" ? args.email : undefined,
        recipient: typeof args?.recipient === "string" ? args.recipient : undefined,
        message: typeof args?.message === "string" ? args.message : undefined,
      };
      try {
        // Scroll to contact section so user sees the form being filled
        if (window.agentNavigate) window.agentNavigate("contact");
      } catch {}
      if (window.ContactBridge && typeof window.ContactBridge.fill === "function") {
        try { window.ContactBridge.fill(payload); } catch {}
      } else {
        // Fallback via DOM if bridge isn't mounted yet
        if (payload.name != null) {
          const el = document.querySelector('[data-agent-id="contact.name"]');
          if (el) el.value = payload.name;
          el?.dispatchEvent(new Event("input", { bubbles: true }));
        }
        if (payload.email != null) {
          const el = document.querySelector('[data-agent-id="contact.email"]');
          if (el) el.value = payload.email;
          el?.dispatchEvent(new Event("input", { bubbles: true }));
        }
        if (payload.recipient != null) {
          const el = document.querySelector('[data-agent-id="contact.recipient"]');
          if (el) el.value = payload.recipient;
          el?.dispatchEvent(new Event("input", { bubbles: true }));
        }
        if (payload.message != null) {
          const el = document.querySelector('[data-agent-id="contact.message"]');
          if (el) el.value = payload.message;
          el?.dispatchEvent(new Event("input", { bubbles: true }));
        }
      }
      return;
    }

    if (name === "contact_submit") {
      try {
        if (window.agentNavigate) window.agentNavigate("contact");
      } catch {}
      if (window.ContactBridge && typeof window.ContactBridge.submit === "function") {
        try { window.ContactBridge.submit(); } catch {}
      } else {
        // Fallback: click the submit button if present
        const btn = document.querySelector('[data-agent-id="contact.submit"]');
        if (btn) {
          try { btn.click(); } catch {}
        } else {
          // As a last resort, try to submit the form directly
          const form = document.querySelector('[data-agent-id="contact.form"]');
          form?.requestSubmit?.();
        }
      }
      return;
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
      {!isOpen && !hideVoiceBtn && (
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
