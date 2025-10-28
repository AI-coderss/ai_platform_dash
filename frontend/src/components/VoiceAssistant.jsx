/* eslint-disable no-useless-concat */
/* eslint-disable no-unused-vars */
import React, { useState, useRef, useEffect } from "react";
import { FaMicrophoneAlt } from "react-icons/fa";
import { motion, AnimatePresence } from "framer-motion";
import AudioWave from "./AudioWave";
import "../styles/VoiceAssistant.css";
import useUiStore from "./store/useUiStore";

/* ---------- WebRTC refs ---------- */
const peerConnectionRef = React.createRef();
const dataChannelRef = React.createRef();
const localStreamRef = React.createRef();

/* ---------- Whitelists / tools (kept intact from your spec) ---------- */
const ALLOWED_SECTIONS = new Set([
  "home", "products", "policy", "watch_tutorial", "contact", "footer",
  "chat", "doctor", "transcription", "analyst", "report", "ivf", "patient", "survey",
]);

const ALLOWED_CONTROL_IDS = new Set([
  "nav.about", "nav.products", "nav.policy", "nav.watch_tutorial", "nav.contact", "nav.footer",
  "products.launch:doctor", "products.launch:transcription", "products.launch:analyst", "products.launch:report",
  "products.launch:ivf", "products.launch:patient", "products.launch:survey",
  "products.help:doctor", "products.help:transcription", "products.help:analyst", "products.help:report",
  "products.help:ivf", "products.help:patient", "products.help:survey",
  "contact.submit",
]);

const TOOL_SCHEMAS = [
  {
    type: "function", name: "navigate_to",
    parameters: {
      type: "object", additionalProperties: false,
      properties: { section: { type: "string", enum: Array.from(ALLOWED_SECTIONS) } },
      required: ["section"]
    }
  },
  {
    type: "function", name: "click_control",
    parameters: {
      type: "object", additionalProperties: false,
      properties: { control_id: { type: "string" } }, required: ["control_id"]
    }
  },
  {
    type: "function", name: "chat_ask",
    parameters: {
      type: "object", additionalProperties: false,
      properties: { text: { type: "string", minLength: 1, maxLength: 500 } }, required: ["text"]
    }
  },
  {
    type: "function", name: "contact_fill",
    parameters: {
      type: "object", additionalProperties: false,
      properties: { name: { type: "string" }, email: { type: "string" }, recipient: { type: "string" }, message: { type: "string" } }
    }
  },
  {
    type: "function", name: "contact_submit",
    parameters: { type: "object", additionalProperties: false, properties: {} }
  },
  {
    type: "function",
    name: "toggle_theme",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        theme: { type: "string", enum: ["light", "dark", "system", "toggle"] }
      },
      required: ["theme"]
    }
  },
  {
    type: "function", name: "chat_toggle",
    parameters: { type: "object", additionalProperties: false, properties: {} }
  },
  {
    type: "function", name: "chat_close",
    parameters: { type: "object", additionalProperties: false, properties: {} }
  },
  {
    type: "function",
    name: "set_chat_visible",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        visible: { type: "boolean" }
      },
      required: ["visible"]
    }
  },
];

/* ----------------- Small top circle visualizer (no 3D, no cube) ---------------- */
const CirclePulse = ({ stream, size = 140 }) => {
  const canvasRef = useRef(null);
  const analyserRef = useRef(null);
  const rafRef = useRef(0);
  const audioCtxRef = useRef(null);
  const sourceRef = useRef(null);

  useEffect(() => {
    if (!stream) return;

    try {
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      const analyser = ac.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.85;
      const src = ac.createMediaStreamSource(stream);
      src.connect(analyser);

      audioCtxRef.current = ac;
      analyserRef.current = analyser;
      sourceRef.current = src;

      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");

      const render = () => {
        rafRef.current = requestAnimationFrame(render);
        if (!analyserRef.current) return;

        const data = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        const energy = avg / 255; // 0..1

        const w = canvas.width;
        const h = canvas.height;
        ctx.clearRect(0, 0, w, h);

        const cx = w / 2;
        const cy = h / 2;
        const baseR = Math.min(w, h) * 0.32;
        const pulse = baseR * (0.25 * energy); // gentle pulse
        const r = baseR + pulse;

        // Subtle glow backdrop
        ctx.beginPath();
        ctx.arc(cx, cy, r + 10, 0, Math.PI * 2);
        const g1 = ctx.createRadialGradient(cx, cy, r * 0.4, cx, cy, r + 12);
        g1.addColorStop(0, "rgba(120, 170, 255, 0.18)");
        g1.addColorStop(1, "rgba(120, 170, 255, 0.02)");
        ctx.fillStyle = g1;
        ctx.fill();

        // Ring
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.lineWidth = Math.max(6, Math.min(12, 8 + energy * 8));
        const g2 = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
        g2.addColorStop(0, "rgba(200,220,255,0.9)");
        g2.addColorStop(1, "rgba(140,180,255,0.6)");
        ctx.strokeStyle = g2;
        ctx.stroke();

        // Center dot
        ctx.beginPath();
        ctx.arc(cx, cy, 6 + energy * 3, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.65)";
        ctx.fill();
      };

      // Resize for crispness
      const setSize = () => {
        const dpr = Math.max(1, window.devicePixelRatio || 1);
        canvas.width = Math.floor(size * dpr);
        canvas.height = Math.floor(size * dpr);
        canvas.style.width = `${size}px`;
        canvas.style.height = `${size}px`;
      };
      setSize();
      window.addEventListener("resize", setSize);

      rafRef.current = requestAnimationFrame(render);

      return () => {
        cancelAnimationFrame(rafRef.current);
        window.removeEventListener("resize", setSize);
        try { src.disconnect(); } catch {}
        try { analyser.disconnect(); } catch {}
        try { ac.close(); } catch {}
        analyserRef.current = null;
        sourceRef.current = null;
        audioCtxRef.current = null;
      };
    } catch {
      // non-fatal
    }
  }, [stream, size]);

  return (
    <div style={{ display: "flex", justifyContent: "center", marginTop: 10, marginBottom: 6 }}>
      <canvas ref={canvasRef} />
    </div>
  );
};

const VoiceAssistant = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMicActive, setIsMicActive] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState("idle");
  const [transcript, setTranscript] = useState("");
  const [responseText, setResponseText] = useState("");
  const [remoteStream, setRemoteStream] = useState(null);
  const audioPlayerRef = useRef(null);
  const dragConstraintsRef = useRef(null);

  // tool call streaming buffers
  const toolBuffersRef = useRef(new Map());
  const recentClicksRef = useRef(new Map());

  // Shared UI store flags/actions
  const { hideVoiceBtn, chooseVoice, resetToggles } = useUiStore();

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
    try { if (audioPlayerRef.current) audioPlayerRef.current.srcObject = null; } catch {}

    setConnectionStatus("idle");
    setIsMicActive(false);
    setTranscript("");
    setResponseText("");
    setRemoteStream(null);

    // When voice session ends, show both controls again
    resetToggles();
  };

  /* ----------------------- EXACT handleToolCall you provided ----------------------- */
  const handleToolCall = (name, args) => {
    if (!name) return;
    if (name === "navigate_to") {
      const section = String(args?.section || "").trim();
      if (!ALLOWED_SECTIONS.has(section)) return;
      if (window.agentNavigate) { try { window.agentNavigate(section); } catch { } }
      else { window.dispatchEvent(new CustomEvent("agent:navigate", { detail: { section } })); }
      return;
    }
    if (name === "click_control") {
      const id = String(args?.control_id || "").trim();
      if (!ALLOWED_CONTROL_IDS.has(id)) return;
      const now = Date.now(); const last = recentClicksRef.current.get(id) || 0;
      if (now - last < 400) return; recentClicksRef.current.set(id, now);
      const el = document.querySelector(`[data-agent-id="${CSS.escape(id)}"]`);
      if (el) {
        try { el.scrollIntoView({ behavior: "smooth", block: "center" }); } catch { }
        try { el.focus({ preventScroll: true }); } catch { }
        try { el.click(); } catch { }
      }
      return;
    }
    if (name === "chat_ask") {
      const text = String(args?.text || "").trim(); if (!text) return;
      if (window.ChatBotBridge?.sendMessage) { try { window.ChatBotBridge.sendMessage(text); } catch { } }
      else { window.dispatchEvent(new CustomEvent("agent:chat.ask", { detail: { text } })); }
      return;
    }
    if (name === "contact_fill") {
      const payload = {
        name: typeof args?.name === "string" ? args.name : undefined,
        email: typeof args?.email === "string" ? args.email : undefined,
        recipient: typeof args?.recipient === "string" ? args.recipient : undefined,
        message: typeof args?.message === "string" ? args.message : undefined,
      };
      try { window.agentNavigate?.("contact"); } catch { }
      if (window.ContactBridge?.fill) { try { window.ContactBridge.fill(payload); } catch { } }
      else {
        const setVal = (sel, val) => { if (val == null) return; const el = document.querySelector(sel); if (!el) return; el.value = val; el.dispatchEvent(new Event("input", { bubbles: true })); };
        setVal('[data-agent-id="contact.name"]', payload.name);
        setVal('[data-agent-id="contact.email"]', payload.email);
        setVal('[data-agent-id="contact.recipient"]', payload.recipient);
        setVal('[data-agent-id="contact.message"]', payload.message);
      }
      return;
    }
    if (name === "contact_submit") {
      try { window.agentNavigate?.("contact"); } catch { }
      if (window.ContactBridge?.submit) { try { window.ContactBridge.submit(); } catch { } }
      else {
        const btn = document.querySelector('[data-agent-id="contact.submit"]');
        if (btn) { try { btn.click(); } catch { } }
        else { document.querySelector('[data-agent-id="contact.form"]')?.requestSubmit?.(); }
      }
      return;
    }
    if (name === "toggle_theme") {
      const mode = String(args?.theme || "toggle").toLowerCase(); // "light"|"dark"|"system"|"toggle"
      const STORAGE_KEY = "app-theme";

      const getSystemPrefersDark = () =>
        window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

      const applyThemeAttr = (m) => {
        const root = document.documentElement;
        const isDark = m === 'dark' || (m === 'system' && getSystemPrefersDark());
        if (isDark) root.setAttribute('data-theme', 'dark');
        else root.removeAttribute('data-theme');
        window.dispatchEvent(new CustomEvent('theme:changed', { detail: { mode: m, isDark } }));
      };

      const current = localStorage.getItem(STORAGE_KEY) || 'light';
      let next = mode;
      if (mode === 'toggle') {
        // flip just dark/light; keep 'system' as resolving to actual value
        next = current === 'dark' ? 'light' : 'dark';
      }

      localStorage.setItem(STORAGE_KEY, next);
      applyThemeAttr(next);
      return;
    }
    if (name === "set_chat_visible") {
      const on = !!args?.visible;
      if (on) {
        if (window.ChatBot?.open) { try { window.ChatBot.open(); } catch { } }
        else { window.dispatchEvent(new CustomEvent("chatbot:open")); }
      } else {
        if (window.ChatBot?.close) { try { window.ChatBot.close(); } catch { } }
        else { window.dispatchEvent(new CustomEvent("chatbot:close")); }
      }
      return;
    }
    if (name === "chat_toggle") {
      if (window.ChatBot?.toggle) window.ChatBot.toggle();
      else window.dispatchEvent(new Event("chatbot:toggle"));
      return;
    }
    if (name === "chat_close") {
      if (window.ChatBot?.close) window.ChatBot.close();
      else window.dispatchEvent(new Event("chatbot:close"));
      return;
    }
  };

  const sendSessionUpdate = () => {
    const ch = dataChannelRef.current;
    if (!ch || ch.readyState !== "open") return;
    try {
      ch.send(JSON.stringify({
        type: "session.update",
        session: {
          modalities: ["text", "audio"],
          turn_detection: { type: "server_vad" },
          tools: TOOL_SCHEMAS,
          tool_choice: { type: "auto" }
        }
      }));
    } catch {}
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
          const s = event.streams[0];
          if (audioPlayerRef.current) {
            audioPlayerRef.current.srcObject = s;
            audioPlayerRef.current.play().catch(() => {});
          }
          setRemoteStream(s);
        }
      };

      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      const channel = pc.createDataChannel("response", { ordered: true });
      dataChannelRef.current = channel;

      channel.onopen = () => {
        setConnectionStatus("connected");
        setResponseText("Connected! Speak now...");
        setIsMicActive(true);

        // Advertise tools to the model
        sendSessionUpdate();

        // Create a response (text+audio) to start the loop
        try { channel.send(JSON.stringify({ type: "response.create", response: { modalities: ["text","audio"] } })); } catch {}
      };

      channel.onmessage = (event) => {
        let msg;
        try { msg = JSON.parse(event.data); } catch { return; }

        // --- standard streaming events
        if (msg.type === "conversation.item.input_audio_transcription.completed") {
          setTranscript(msg.transcript || "");
          setResponseText("");
          return;
        }
        if (msg.type === "response.text.delta") {
          setResponseText((prev) => prev + (msg.delta || ""));
          return;
        }
        if (msg.type === "response.done") {
          setTranscript("");
          return;
        }

        // --- tool calling streaming: buffer and dispatch on completion
        if (msg.type === "response.output_item.added" && msg.item?.type === "function_call") {
          const id = msg.item.call_id || msg.item.id || "default";
          toolBuffersRef.current.set(id, { name: msg.item.name || "", argsText: "" });
          return;
        }
        if (msg.type === "response.function_call_arguments.delta" || msg.type === "tool_call.delta") {
          const id = msg.call_id || msg.id || "default";
          const prev = toolBuffersRef.current.get(id) || { name: "", argsText: "" };
          prev.argsText += (msg.delta || msg.arguments_delta || "");
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
          let args = {};
          try { args = JSON.parse(buf.argsText || "{}"); } catch {}
          handleToolCall(buf.name || "unknown_tool", args);
          return;
        }
      };

      channel.onerror = () => {
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

      // Create offer (prefer opus params)
      const offer = await pc.createOffer({ offerToReceiveAudio: true });
      offer.sdp = offer.sdp.replace(
        /a=rtpmap:\d+ opus\/48000\/2/g,
        "a=rtpmap:111 opus/48000/2\r\n" + "a=fmtp:111 minptime=10;useinbandfec=1"
      );
      await pc.setLocalDescription(offer);

      // Your backend SDP exchange
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

  const toggleAssistant = () => {
    setIsOpen((prev) => {
      const opening = !prev;
      if (opening) {
        chooseVoice();
        startWebRTC();
      } else {
        cleanupWebRTC();
      }
      return !prev;
    });
  };

  const toggleMic = () => {
    if (connectionStatus === "connected" && localStreamRef.current) {
      const nextState = !isMicActive;
      setIsMicActive(nextState);
      try {
        localStreamRef.current.getAudioTracks().forEach((t) => (t.enabled = nextState));
      } catch {}
    }
  };

  return (
    <>
      {/* Floating voice button only if NOT hidden by avatar choice and not already open */}
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
              <button className="close-btn-green" onClick={toggleAssistant}>✖</button>
            </div>

            {/* NEW: Top circle (inside the card, above the audio wave) */}
            <CirclePulse stream={remoteStream} size={140} />

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
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default VoiceAssistant;




