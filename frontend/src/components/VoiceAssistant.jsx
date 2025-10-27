/* eslint-disable no-useless-concat */
/* eslint-disable no-unused-vars */
/* eslint-disable no-unused-vars */
/* eslint-disable no-useless-concat */
/* eslint-disable no-unused-vars */
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

/* ---------- Whitelists / tools (kept intact) ---------- */
const ALLOWED_SECTIONS = new Set([
  "home","products","policy","watch_tutorial","contact","footer",
  "chat","doctor","transcription","analyst","report","ivf","patient","survey",
]);
const ALLOWED_CONTROL_IDS = new Set([
  "nav.about","nav.products","nav.policy","nav.watch_tutorial","nav.contact","nav.footer",
  "products.launch:doctor","products.launch:transcription","products.launch:analyst","products.launch:report",
  "products.launch:ivf","products.launch:patient","products.launch:survey",
  "products.help:doctor","products.help:transcription","products.help:analyst","products.help:report",
  "products.help:ivf","products.help:patient","products.help:survey",
  "contact.submit",
]);
const TOOL_SCHEMAS = [
  {
    type: "function", name: "navigate_to",
    parameters: { type: "object", additionalProperties: false,
      properties: { section: { type: "string", enum: Array.from(ALLOWED_SECTIONS) } },
      required: ["section"]
    }
  },
  {
    type: "function", name: "click_control",
    parameters: { type: "object", additionalProperties: false,
      properties: { control_id: { type: "string" } }, required: ["control_id"]
    }
  },
  {
    type: "function", name: "chat_ask",
    parameters: { type: "object", additionalProperties: false,
      properties: { text: { type: "string", minLength: 1, maxLength: 500 } }, required: ["text"]
    }
  },
  {
    type: "function", name: "contact_fill",
    parameters: { type: "object", additionalProperties: false,
      properties: { name: { type: "string" }, email: { type: "string" }, recipient: { type: "string" }, message: { type: "string" } }
    }
  },
  {
    type: "function", name: "contact_submit",
    parameters: { type: "object", additionalProperties: false, properties: {} }
  },
];

/* ---------- WebGL shaders: transparent glass cube + internal water ---------- */
const vertexSource = `#version 300 es
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
in vec2 position;
void main(){ gl_Position = vec4(position, 0., 1.); }`;

const fragmentSource = `#version 300 es
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
out vec4 fragColor;
uniform vec2 resolution;
uniform float time;

#define PI 3.14159265359
#define T time
#define S smoothstep

mat3 rotX(float a){ float s=sin(a), c=cos(a); return mat3(vec3(1,0,0), vec3(0,c,-s), vec3(0,s,c)); }
mat3 rotY(float a){ float s=sin(a), c=cos(a); return mat3(vec3(c,0,s), vec3(0,1,0), vec3(-s,0,c)); }
mat3 rotZ(float a){ float s=sin(a), c=cos(a); return mat3(vec3(c,-s,0), vec3(s,c,0), vec3(0,0,1)); }

float rnd(float a){ return fract(sin(a*76.5453123)*45617.234); }
float noise(vec2 p){
  vec2 i=floor(p), f=fract(p);
  float n=i.x+i.y*57.;
  float a=mix(rnd(n),rnd(n+1.),f.x);
  float b=mix(rnd(n+57.),rnd(n+58.),f.x);
  return mix(a,b,f.y);
}

float boxSDF(vec3 p, vec3 s, float r){
  p=abs(p)-s;
  return length(max(p,0.))+min(0.,max(max(p.x,p.y),p.z))-r;
}

float glassSDF(vec3 p){
  float wob = S(0.,1., clamp(noise((p.xz + p.yy)*6.), 0.35, 0.65));
  return boxSDF(p, vec3(1.), 0.06) * wob;
}

vec3 normal(vec3 p){
  vec2 e=vec2(1e-2,0.);
  float d=glassSDF(p);
  vec3 n = d - vec3(
    glassSDF(p - e.xyy),
    glassSDF(p - e.yxy),
    glassSDF(p - e.yyx)
  );
  return normalize(n);
}

vec3 dir(vec2 uv, vec3 ro, vec3 t, float z){
  vec3 up=vec3(0,1,0);
  vec3 f=normalize(t-ro);
  vec3 r=normalize(cross(up,f));
  vec3 u=cross(f,r);
  return normalize(f*z + uv.x*r + uv.y*u);
}

// Water surface (inside cube)
float waterHeight(vec2 xz){
  return -0.15
    + 0.06*sin(xz.x*4.0 + T*1.3)
    + 0.05*sin(xz.y*3.2 - T*1.1);
}
vec3 waterNormal(vec2 xz){
  float dx = 0.06*4.0*cos(xz.x*4.0 + T*1.3);
  float dz = 0.05*3.2*cos(xz.y*3.2 - T*1.1);
  vec3 n = normalize(vec3(-dx, 1.0, -dz));
  return n;
}

void main(){
  vec2 uv=(gl_FragCoord.xy - 0.5*resolution.xy)/min(resolution.x,resolution.y);

  // Camera rotate => cube looks like it rotates
  vec3 ro=vec3(0.,0.,-3.8);
  float total=24.0, ph = mod(T,total), a;
  if(ph<6.){ a=-ph*(PI/3.); ro*=rotY(a); }
  else if(ph<12.){ a=-(6.*(PI/3.))+(ph-6.)*(PI/3.); ro*=rotY(a); }
  else if(ph<18.){ a=(ph-12.)*(PI/3.); ro*=rotZ(a); }
  else{ float t4=ph-18.; float pitch=sin(t4*PI/6.)*1.2; ro*=rotX(pitch); }

  vec3 rd=dir(uv,ro,vec3(0),1.);

  vec3 col=vec3(0.0);
  float alpha=0.0;
  float side=1.0;
  bool hitGlass=false;

  vec3 glassTint = vec3(0.78, 0.88, 1.0);
  vec3 waterTint = vec3(0.25, 0.45, 0.75);

  vec3 p=ro;
  for(float i=0.; i<90.; i++){
    float d = glassSDF(p)*side;
    if(d<1e-3){
      hitGlass = true;
      vec3 n = normal(p)*side;
      float fres = pow(1.0 - max(0.0, dot(-rd,n)), 5.0);
      float gloss = pow(max(0.0, dot(reflect(-rd,n), n)), 16.0);
      col += 0.10*glassTint + 0.35*fres*glassTint + 0.20*gloss;
      alpha += mix(0.18, 0.78, fres);
      side = -side;
      vec3 rdo = refract(rd, n, 1.0 + 0.42*side);
      if(dot(rdo,rdo)==0.0) rdo = reflect(rd, n);
      rd = rdo;
      d = 0.08;
    }
    if(hitGlass && side < 0.0){
      float wh = waterHeight(p.xz);
      float sdw = p.y - wh;
      float below = clamp(-sdw*3.0, 0.0, 1.0);
      col += below * waterTint * 0.05;
      float nearSurf = exp(-abs(sdw)*120.0);
      if(nearSurf > 0.001){
        vec3 wn = waterNormal(p.xz);
        vec3 l = normalize(vec3(0.35, 0.9, -0.25));
        vec3 h = normalize(l - rd);
        float spec = pow(max(0.0, dot(wn,h)), 28.0);
        col += nearSurf * (0.05 + 0.35*spec) * vec3(0.6,0.85,1.0);
      }
    }
    if(d>20.) break;
    p += rd * d;
  }

  col = mix(col, vec3(1.0), 0.06);
  alpha = clamp(alpha, 0.0, 0.88);
  fragColor = vec4(col, alpha);
}
`;

/* ---------- small math helpers ---------- */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rotXJS = (a, v) => {
  const s=Math.sin(a), c=Math.cos(a);
  return [v[0], c*v[1]-s*v[2], s*v[1]+c*v[2]];
};
const rotYJS = (a, v) => {
  const s=Math.sin(a), c=Math.cos(a);
  return [c*v[0]+s*v[2], v[1], -s*v[0]+c*v[2]];
};
const rotZJS = (a, v) => {
  const s=Math.sin(a), c=Math.cos(a);
  return [c*v[0]-s*v[1], s*v[0]+c*v[1], v[2]];
};

/* ---------- Component ---------- */
const VoiceAssistant = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMicActive, setIsMicActive] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState("idle");
  const [transcript, setTranscript] = useState("");
  const [responseText, setResponseText] = useState("");
  const [remoteStream, setRemoteStream] = useState(null);

  const audioPlayerRef = useRef(null);

  // WebGL
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const glRef = useRef(null);
  const rafRef = useRef(0);
  const programRef = useRef(null);
  const bufferRef = useRef(null);
  const posLocRef = useRef(null);
  const timeLocRef = useRef(null);
  const resLocRef = useRef(null);

  // Mic that tracks a cube face point (but does NOT rotate itself)
  const micWrapRef = useRef(null);
  const micRAFRef = useRef(0);

  const { hideVoiceBtn, chooseVoice, resetToggles } = useUiStore();
  const toolBuffersRef = useRef(new Map());
  const recentClicksRef = useRef(new Map());

  /* ---------- WebRTC core (kept intact) ---------- */
  const cleanupWebRTC = () => {
    if (peerConnectionRef.current) { try { peerConnectionRef.current.close(); } catch {} peerConnectionRef.current = null; }
    if (dataChannelRef.current) { try { dataChannelRef.current.close(); } catch {} dataChannelRef.current = null; }
    if (localStreamRef.current) { try { localStreamRef.current.getTracks().forEach(t=>t.stop()); } catch {} localStreamRef.current=null; }
    setConnectionStatus("idle");
    setIsMicActive(false);
    setTranscript(""); setResponseText("");
    resetToggles();
  };

  const sendSessionUpdate = () => {
    const ch = dataChannelRef.current;
    if (!ch || ch.readyState !== "open") return;
    try {
      ch.send(JSON.stringify({
        type: "session.update",
        session: {
          voice: "alloy",
          modalities: ["text","audio"],
          turn_detection: { type: "server_vad" },
          tools: TOOL_SCHEMAS, tool_choice: { type: "auto" },
          instructions:
            "You are the DSAH voice assistant. Use tools (navigate_to, click_control, chat_ask, contact_fill, contact_submit). " +
            "For email: collect name, email, optional recipient, message; call contact_fill then contact_submit."
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

      const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
      peerConnectionRef.current = pc;

      pc.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
          const s = event.streams[0];
          if (audioPlayerRef.current) {
            audioPlayerRef.current.srcObject = s;
            audioPlayerRef.current.play().catch(()=>{});
          }
          setRemoteStream(s);
        }
      };
      stream.getTracks().forEach((t)=>pc.addTrack(t, stream));

      const ch = pc.createDataChannel("response", { ordered: true });
      dataChannelRef.current = ch;

      ch.onopen = () => {
        setConnectionStatus("connected");
        setResponseText("Connected! Speak now...");
        setIsMicActive(true);
        try { ch.send(JSON.stringify({ type: "response.create", response: { modalities: ["text","audio"] } })); } catch {}
        sendSessionUpdate();
      };
      ch.onmessage = (event) => {
        let msg; try { msg = JSON.parse(event.data); } catch { return; }
        switch (msg.type) {
          case "conversation.item.input_audio_transcription.completed": setTranscript(msg.transcript||""); setResponseText(""); break;
          case "response.text.delta": setResponseText(prev => prev + (msg.delta || "")); break;
          case "response.done": setTranscript(""); break;
          default: break;
        }
        // Tool streaming buffer
        if (msg.type === "response.output_item.added" && msg.item?.type === "function_call") {
          const id = msg.item.call_id || msg.item.id || "default";
          const prev = toolBuffersRef.current.get(id) || { name:"", argsText:"" };
          prev.name = msg.item.name || prev.name;
          toolBuffersRef.current.set(id, prev);
          return;
        }
        if (msg.type === "response.function_call_arguments.delta" || msg.type === "tool_call.delta") {
          const id = msg.call_id || msg.id || "default";
          const delta = msg.delta || msg.arguments_delta || "";
          const prev = toolBuffersRef.current.get(id) || { name:"", argsText:"" };
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
          let args = {};
          try { args = JSON.parse(buf.argsText || "{}"); } catch {}
          handleToolCall(buf.name || "unknown_tool", args);
        }
      };
      ch.onerror = () => { setConnectionStatus("error"); setResponseText("Connection error."); };
      ch.onclose = cleanupWebRTC;
      pc.onconnectionstatechange = () => {
        const s = pc.connectionState;
        if (s==="failed" || s==="disconnected" || s==="closed") cleanupWebRTC();
      };

      const offer = await pc.createOffer({ offerToReceiveAudio: true });
      offer.sdp = offer.sdp.replace(
        /a=rtpmap:\d+ opus\/48000\/2/g,
        "a=rtpmap:111 opus/48000/2\r\n" + "a=fmtp:111 minptime=10;useinbandfec=1"
      );
      await pc.setLocalDescription(offer);

      const res = await fetch(
        "https://ai-platform-dash-voice-chatbot-togglabe.onrender.com/api/rtc-connect",
        { method:"POST", headers:{ "Content-Type":"application/sdp" }, body: offer.sdp }
      );
      if (!res.ok) throw new Error(`Server responded with ${res.status}`);
      const answer = await res.text();
      await pc.setRemoteDescription({ type:"answer", sdp: answer });
    } catch {
      setConnectionStatus("error");
      setResponseText("Failed to start session.");
      cleanupWebRTC();
    }
  };

  const handleToolCall = (name, args) => {
    if (!name) return;

    if (name === "navigate_to") {
      const section = String(args?.section || "").trim();
      if (!ALLOWED_SECTIONS.has(section)) return;
      if (window.agentNavigate) { try { window.agentNavigate(section); } catch {} }
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
        try { el.scrollIntoView({ behavior:"smooth", block:"center" }); } catch {}
        try { el.focus({ preventScroll:true }); } catch {}
        try { el.click(); } catch {}
      }
      return;
    }
    if (name === "chat_ask") {
      const text = String(args?.text || "").trim(); if (!text) return;
      if (window.ChatBotBridge?.sendMessage) { try { window.ChatBotBridge.sendMessage(text); } catch {} }
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
      try { window.agentNavigate?.("contact"); } catch {}
      if (window.ContactBridge?.fill) { try { window.ContactBridge.fill(payload); } catch {} }
      else {
        const setVal = (sel, val) => { if (val == null) return; const el = document.querySelector(sel); if (!el) return; el.value = val; el.dispatchEvent(new Event("input", { bubbles:true })); };
        setVal('[data-agent-id="contact.name"]', payload.name);
        setVal('[data-agent-id="contact.email"]', payload.email);
        setVal('[data-agent-id="contact.recipient"]', payload.recipient);
        setVal('[data-agent-id="contact.message"]', payload.message);
      }
      return;
    }
    if (name === "contact_submit") {
      try { window.agentNavigate?.("contact"); } catch {}
      if (window.ContactBridge?.submit) { try { window.ContactBridge.submit(); } catch {} }
      else {
        const btn = document.querySelector('[data-agent-id="contact.submit"]');
        if (btn) { try { btn.click(); } catch {} }
        else { document.querySelector('[data-agent-id="contact.form"]')?.requestSubmit?.(); }
      }
      return;
    }
  };

  /* ---------- WebGL init/render (transparent) ---------- */
  const initWebGL = () => {
    const holder = containerRef.current, canvas = canvasRef.current;
    if (!holder || !canvas) return;
    const gl = canvas.getContext("webgl2", { antialias:true, alpha:true, premultipliedAlpha:true });
    if (!gl) { glRef.current = null; return; }
    glRef.current = gl;

    const compile = (type, src) => {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s));
      return s;
    };
    const vs = compile(gl.VERTEX_SHADER, vertexSource);
    const fs = compile(gl.FRAGMENT_SHADER, fragmentSource);
    const program = gl.createProgram();
    gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) console.error(gl.getProgramInfoLog(program));
    programRef.current = program;

    const verts = new Float32Array([-1,-1, 1,-1, -1,1,  -1,1, 1,-1, 1,1]);
    const buf = gl.createBuffer(); bufferRef.current = buf;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    const posLoc = gl.getAttribLocation(program, "position"); posLocRef.current = posLoc;
    gl.enableVertexAttribArray(posLoc); gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    timeLocRef.current = gl.getUniformLocation(program, "time");
    resLocRef.current = gl.getUniformLocation(program, "resolution");

    gl.clearColor(0,0,0,0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const resize = () => {
      const rect = holder.getBoundingClientRect();
      const dpr = Math.max(1, 0.5*window.devicePixelRatio);
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      gl.viewport(0,0,canvas.width, canvas.height);
    };

    const draw = (now) => {
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(programRef.current);
      gl.bindBuffer(gl.ARRAY_BUFFER, bufferRef.current);
      gl.uniform1f(timeLocRef.current, now * 0.001);
      gl.uniform2f(resLocRef.current, canvas.width, canvas.height);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };

    const loop = (now) => { draw(now); rafRef.current = requestAnimationFrame(loop); };
    resize();
    window.addEventListener("resize", resize);
    rafRef.current = requestAnimationFrame(loop);

    canvas.__cleanup = () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      try { const ext = gl.getExtension("WEBGL_lose_context"); if (ext) ext.loseContext(); } catch {}
      glRef.current = null; programRef.current=null; bufferRef.current=null;
    };
  };
  const teardownWebGL = () => {
    const canvas = canvasRef.current;
    if (canvas && typeof canvas.__cleanup === "function") { try { canvas.__cleanup(); } catch {} delete canvas.__cleanup; }
  };

  /* ---------- Attach mic to one cube face (position-only; no self-rotation) ---------- */
  const startMicAttachLoop = () => {
    const wrap = micWrapRef.current;
    const holder = containerRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !holder || !canvas) return;

    const fovDeg = 60; // matches three.js-ish default + our shader vibe
    const f = 1 / Math.tan((fovDeg * Math.PI/180) / 2);
    const cz = 3.8;   // camera distance used in shader
    const anchorLocal = [0.0, -0.72, 1.02]; // bottom-center on the “front” face, slightly inward

    const tick = (tms) => {
      const t = tms * 0.001;
      const total = 24.0;
      let ph = t % total;

      // Camera “phase” angles from the shader:
      let angY = 0, angZ = 0, angX = 0; // camera rotations
      if (ph < 6.0) {
        angY = -ph * (Math.PI/3.0);
      } else if (ph < 12.0) {
        angY = -(6.0*(Math.PI/3.0)) + (ph - 6.0) * (Math.PI/3.0);
      } else if (ph < 18.0) {
        angZ = (ph - 12.0) * (Math.PI/3.0);
      } else {
        const t4 = ph - 18.0;
        angX = Math.sin(t4 * Math.PI / 6.0) * 1.2;
      }

      // Inverse rotation for the world point (so it looks attached to a face as cube “turns”)
      // Apply inverse rotations per-axis
      let p = anchorLocal.slice(0);
      if (angY !== 0) p = rotYJS(-angY, p);
      if (angZ !== 0) p = rotZJS(-angZ, p);
      if (angX !== 0) p = rotXJS(-angX, p);

      // Project to 2D (simple pinhole)
      const rect = holder.getBoundingClientRect();
      const aspect = rect.width / rect.height;

      // Camera at (0,0,-cz), looking to origin
      const pc = [p[0], p[1], p[2] + cz]; // p - camPos

      // If behind camera, skip drawing (optional: hide)
      if (pc[2] <= 0.1) {
        wrap.style.opacity = "0";
      } else {
        wrap.style.opacity = "1";
        const ndcX = (pc[0] / pc[2]) * (f / aspect);
        const ndcY = (pc[1] / pc[2]) * f;

        const px = (ndcX * 0.5 + 0.5) * rect.width;
        const py = (1 - (ndcY * 0.5 + 0.5)) * rect.height;

        wrap.style.left = `${clamp(px, 0, rect.width)}px`;
        wrap.style.top  = `${clamp(py, 0, rect.height)}px`;
      }

      micRAFRef.current = requestAnimationFrame(tick);
    };
    micRAFRef.current = requestAnimationFrame(tick);
  };
  const stopMicAttachLoop = () => {
    cancelAnimationFrame(micRAFRef.current || 0);
  };

  /* ---------- Open/close ---------- */
  const toggleAssistant = () => {
    setIsOpen(prev => {
      const opening = !prev;
      if (opening) {
        chooseVoice();
        startWebRTC();
        setTimeout(() => { initWebGL(); startMicAttachLoop(); }, 0);
      } else {
        cleanupWebRTC();
        teardownWebGL();
        stopMicAttachLoop();
      }
      return !prev;
    });
  };

  const toggleMic = () => {
    if (connectionStatus === "connected" && localStreamRef.current) {
      const next = !isMicActive;
      setIsMicActive(next);
      localStreamRef.current.getAudioTracks().forEach(t => { t.enabled = next; });
    }
  };

  useEffect(() => {
    return () => { teardownWebGL(); cleanupWebRTC(); stopMicAttachLoop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {/* Do NOT style the FAB; you already have styling elsewhere */}
      {!isOpen && !hideVoiceBtn && (
        <motion.button
          className="voice-toggle-btn left"
          onClick={toggleAssistant}
          title="Open Voice Assistant"
        >
          +
        </motion.button>
      )}

      <AnimatePresence>
        {isOpen && (
          <motion.div className="va-cube-wrap" drag dragElastic={0.2}>
            <audio ref={audioPlayerRef} className="va-hidden-audio" />

            <div ref={containerRef} className="va-cube-body">
              <div className="va-canvas-stack">
                <canvas ref={canvasRef} className="va-canvas" />

                {/* Top waveform inside the cube */}
                <div className="va-audiowave">
                  {remoteStream ? (
                    <AudioWave stream={remoteStream} />
                  ) : (
                    <div className="va-audiowave-placeholder">Connecting…</div>
                  )}
                </div>

                {/* Mic: attached to one face, position follows cube; orientation stays fixed */}
                <div
                  ref={micWrapRef}
                  className="va-mic-wrap"
                  style={{ left: "50%", top: "50%" }}
                >
                  <button
                    className={`va-mic-core ${isMicActive ? "active" : ""}`}
                    onClick={toggleMic}
                    disabled={connectionStatus !== "connected"}
                    title={isMicActive ? "Mute microphone" : "Unmute microphone"}
                  >
                    <FaMicrophoneAlt />
                  </button>
                </div>

                <button className="va-close-ghost" onClick={toggleAssistant} title="Close">✖</button>
              </div>
            </div>

            <div className="va-visually-hidden" aria-live="polite">{transcript}</div>
            <div className="va-visually-hidden" aria-live="polite">{responseText}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default VoiceAssistant;
