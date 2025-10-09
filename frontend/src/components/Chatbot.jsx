/* eslint-disable no-loop-func */
import React, { useState, useRef, useLayoutEffect, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { motion, useMotionValue } from "framer-motion";
import ChatInputWidget from "./ChatInputWidget";
import "../styles/ChatBot.css";
import useCardStore from "./store/useCardStore";

/**
 * D-ID integration:
 * - The avatar is mounted *inside* the chat body first (docked).
 * - Clicking the docked avatar pops it out into a draggable, fixed container.
 * - Close/dock returns it back inside the chat body (prevents FAB overlap).
 * - No black bars/headers/overlays.
 */

const DID_AGENT_SRC = "https://agent.d-id.com/v2/index.js";
const DID_SCRIPT_ID = "did-agent-loader-v2";
const CANDIDATE_SELECTORS = [
  '[data-name="did-agent"]',
  "#did-agent",
  ".did-voice-agent",
  "[data-did-agent]",
];

// 👉 use your real key/id or env vars.
const DID_CLIENT_KEY =
  process.env.REACT_APP_DID_CLIENT_KEY ||
  "Z29vZ2xlLW9hdXRoMnwxMTI1MzgwMDI5NzAxNDIxMTMxNDI6TG5FLWVDS1IyaE9VMEcyS2FUVnh0";
const DID_AGENT_ID =
  process.env.REACT_APP_DID_AGENT_ID || "v2_agt_uxCkm0YX";

// ---- Chat content ----------------------------------------------------------------
const initialQuestions = [
  "What can the AI Doctor Assistant do?",
  "How does the Medical Transcription App work?",
  "Can the Data Analyst show me hospital insights?",
  "How can I enhance a medical report using AI?",
  "Tell me more about the IVF Virtual Training Assistant.",
  "Can the Patient Assistant help with navigation?",
  "How to use the AI Doctor Assistant?",
  "How does the IVF Virtual Training Assistant work?",
];

const ChatBot = () => {
  const [open, setOpen] = useState(false);
  const [accordionOpen, setAccordionOpen] = useState(false);
  const [messages, setMessages] = useState([
    { type: "bot", text: "Hi! Ask me anything about these AI tools." },
  ]);
  const [visibleQuestions, setVisibleQuestions] = useState(initialQuestions);
  const [loading, setLoading] = useState(false);
  const chatBodyRef = useRef(null);
  const { setActiveCardId } = useCardStore();

  // Session id
  const [sessionId] = useState(() => {
    const id = localStorage.getItem("chatbot-session") || crypto.randomUUID();
    localStorage.setItem("chatbot-session", id);
    return id;
  });

  // ---- Make the ChatBot itself draggable (desktop only) ----------------------
  const isMobile = typeof window !== "undefined" && window.innerWidth <= 768;
  const chatX = useMotionValue(0);
  const chatY = useMotionValue(0);

  // ---- D-ID draggable widget state ------------------------------------------
  const [isFloating, setIsFloating] = useState(false); // false = docked in chat body
  const [didReady, setDidReady] = useState(false);
  const dockRef = useRef(null);       // where avatar lives when docked
  const floatRef = useRef(null);      // where avatar lives when floating
  const observerRef = useRef(null);

  // Floating avatar starting position (avoid bottom-right FAB)
  const x = useMotionValue(typeof window !== "undefined" ? window.innerWidth - 380 : 0);
  const y = useMotionValue(typeof window !== "undefined" ? 80 : 0);

  // --------- D-ID helpers ----------
  const findDidNode = () => {
    for (const sel of CANDIDATE_SELECTORS) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  };

  const neutralizeDidStyles = (el) => {
    // Ensure the script’s DOM doesn’t enforce its own fixed placement
    el.style.position = "static";
    el.style.inset = "auto";
    el.style.right = "auto";
    el.style.left = "auto";
    el.style.bottom = "auto";
    el.style.top = "auto";
    el.style.margin = "0";
    el.style.maxWidth = "100%";

    // Safety sweep
    el.querySelectorAll("*").forEach((n) => {
      const cs = window.getComputedStyle(n);
      if (cs.position === "fixed") {
        n.style.position = "static";
        n.style.inset = "auto";
        n.style.right = "auto";
        n.style.left = "auto";
        n.style.bottom = "auto";
        n.style.top = "auto";
      }
    });
  };

  const attachTo = (container) => {
    const node = findDidNode();
    if (node && container) {
      neutralizeDidStyles(node);
      container.appendChild(node);
      setDidReady(true);
    }
  };

  const startObserver = () => {
    if (observerRef.current) return;
    const obs = new MutationObserver(() => {
      const target = isFloating ? floatRef.current : dockRef.current;
      if (target) attachTo(target);
    });
    obs.observe(document.body, { childList: true, subtree: true });
    observerRef.current = obs;
  };

  const stopObserver = () => {
    observerRef.current?.disconnect();
    observerRef.current = null;
  };

  const injectDidScript = () => {
    if (document.getElementById(DID_SCRIPT_ID)) return;
    const s = document.createElement("script");
    s.type = "module";
    s.async = true;
    s.src = DID_AGENT_SRC;
    s.id = DID_SCRIPT_ID;
    s.dataset.mode = "fabio";
    s.dataset.clientKey = DID_CLIENT_KEY;
    s.dataset.agentId = DID_AGENT_ID;
    s.dataset.name = "did-agent";
    s.dataset.monitor = "true";
    s.dataset.orientation = "horizontal";
    // position is irrelevant; we re-parent
    s.dataset.position = "right";
    document.body.appendChild(s);
  };

  // Inject and dock when chat opens (avatar first appears *inside* the chat)
  useEffect(() => {
    if (!open) return;
    injectDidScript();
    startObserver();
    // If node already exists, dock immediately
    setTimeout(() => {
      if (dockRef.current) attachTo(dockRef.current);
    }, 0);
    return () => {
      // keep the avatar alive; just stop observing
      stopObserver();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Clicking the docked avatar pops it out
  const popOutAvatar = () => {
    setIsFloating(true);
    // If node already exists, move immediately
    setTimeout(() => {
      if (floatRef.current) attachTo(floatRef.current);
    }, 0);
  };

  // Dock back into chat
  const dockAvatar = () => {
    setIsFloating(false);
    setTimeout(() => {
      if (dockRef.current) attachTo(dockRef.current);
    }, 0);
  };

  // Keep scroll pinned to bottom while streaming
  useLayoutEffect(() => {
    if (chatBodyRef.current) {
      requestAnimationFrame(() => {
        chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
      });
    }
  }, [messages, loading]);

  // ---------------- Existing streaming logic (unchanged) ----------------------
  const handleSendMessage = async ({ text }) => {
    if (!text?.trim()) return;

    const userMsg = { type: "user", text };
    setMessages((prev) => [...prev, userMsg]);
    setAccordionOpen(false);
    setLoading(true);

    let botText = "";
    try {
      const response = await fetch(
        "https://ai-platform-dsah-backend-chatbot.onrender.com/stream",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text, session_id: sessionId }),
        }
      );

      if (!response.ok || !response.body) throw new Error("Streaming failed");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      setMessages((prev) => [...prev, { type: "bot", text: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        botText += decoder.decode(value, { stream: true });
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { type: "bot", text: botText };
          return updated;
        });
      }

      // 🔁 classify -> card
      const classifyRes = await fetch(
        "https://ai-platform-dsah-backend-chatbot.onrender.com/classify",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: text, ai_response: botText }),
        }
      );

      if (classifyRes.ok) {
        const data = await classifyRes.json();
        if (data.card_id) {
          setActiveCardId(data.card_id);
        }
      } else {
        console.warn("Classification request failed");
      }
    } catch (err) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        { type: "bot", text: "⚠️ Error streaming response." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleQuestionClick = (question) => {
    handleSendMessage({ text: question });
    setVisibleQuestions((prev) => prev.filter((q) => q !== question));
    setAccordionOpen(false);
  };

  return (
    <>
      {/* Existing Chat FAB (unchanged) */}
      <button className="chat-toggle" onClick={() => setOpen(!open)}>
        <img src="/icons/chat.svg" alt="Chat" className="chat-icon" />
      </button>

      {open && isMobile && (
        <button className="chat-close-mobile" onClick={() => setOpen(false)}>
          ✖
        </button>
      )}

      {open && (
        <motion.div
          className="chat-box"
          drag={!isMobile}
          dragMomentum={false}
          style={{ x: chatX, y: chatY }}
        >
          <div
            className="chat-header"
            style={{ background: "#2563eb", color: "#fff", fontWeight: 600 }}
          >
            AI Assistant
          </div>

          <div className="chat-body" ref={chatBodyRef}>
            {/* ---- DOCKED avatar lives here first ---- */}
            <div
              ref={dockRef}
              onClick={popOutAvatar}
              title="Click to pop out"
              style={{
                width: "100%",
                minHeight: 72,
                display: isFloating ? "none" : "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "8px 6px",
                background: "transparent", // no black/grey bars
                borderRadius: 12,
                margin: "0 10px 10px",
                border: "1px dashed #e5e7eb",
                cursor: "pointer",
              }}
            >
              {!didReady && (
                <span style={{ color: "#64748b", fontSize: 12 }}>
                  Avatar loads here. Click to pop out.
                </span>
              )}
            </div>

            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`chat-msg ${msg.type}`}
                style={{
                  maxWidth: "70%",
                  alignSelf: msg.type === "user" ? "flex-end" : "flex-start",
                  background: msg.type === "user" ? "#2563eb" : "#f1f6fd",
                  color: msg.type === "user" ? "#fff" : "#222",
                  padding: "8px 12px",
                  margin: msg.type === "user" ? "6px" : "0px 15px",
                  borderRadius: "14px",
                  fontSize: "14px",
                  lineHeight: 1.4,
                }}
              >
                {msg.type === "bot" ? (
                  <ReactMarkdown>{msg.text}</ReactMarkdown>
                ) : (
                  msg.text
                )}
              </div>
            ))}

            {loading && (
              <div className="chat-msg bot loader" style={{ alignSelf: "flex-start" }}>
                <span className="dot"></span>
                <span className="dot"></span>
                <span className="dot"></span>
              </div>
            )}
          </div>

          {visibleQuestions.length > 0 && (
            <div className="predefined-questions-container">
              {visibleQuestions.length > 3 ? (
                <>
                  <div
                    className="accordion-header"
                    onClick={() => setAccordionOpen((prev) => !prev)}
                  >
                    <span>Show Suggested Questions</span>
                    <span className={`chevron ${accordionOpen ? "rotate" : ""}`}>
                      ▼
                    </span>
                  </div>
                  <div className={`accordion-body ${accordionOpen ? "open" : ""}`}>
                    <div className="accordion-content">
                      {visibleQuestions.map((q, i) => (
                        <button
                          key={i}
                          className="predefined-q fade-in"
                          style={{ animationDelay: `${i * 0.05}s` }}
                          onClick={() => handleQuestionClick(q)}
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                visibleQuestions.map((q, i) => (
                  <button
                    key={i}
                    className="predefined-q fade-in"
                    style={{ animationDelay: `${i * 0.05}s` }}
                    onClick={() => handleQuestionClick(q)}
                  >
                    {q}
                  </button>
                ))
              )}
            </div>
          )}

          <ChatInputWidget onSendMessage={handleSendMessage} />
        </motion.div>
      )}

      {/* ---------- FLOATING D-ID container (no black chrome; draggable) ---------- */}
      {isFloating && (
        <motion.div
          role="dialog"
          aria-label="D-ID Avatar"
          drag
          dragMomentum={false}
          style={{
            position: "fixed",
            left: 0,
            top: 0,
            x,
            y,
            zIndex: 9999,
            pointerEvents: "auto",
            background: "transparent", // no black background
          }}
        >
          {/* Minimal, unobtrusive dock button (not black) */}
          <button
            onClick={dockAvatar}
            title="Dock back to chat"
            style={{
              position: "absolute",
              right: -6,
              top: -6,
              width: 22,
              height: 22,
              borderRadius: 11,
              border: "1px solid rgba(0,0,0,0.15)",
              background: "rgba(255,255,255,0.9)",
              color: "#111",
              fontSize: 12,
              lineHeight: "20px",
              textAlign: "center",
              cursor: "pointer",
              boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
            }}
          >
            ↩
          </button>

          {/* Mount point for the real D-ID widget; transparent wrapper */}
          <div
            ref={floatRef}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {!didReady && (
              <span style={{ color: "#475569", fontSize: 12, padding: "4px 8px" }}>
                Loading avatar…
              </span>
            )}
          </div>
        </motion.div>
      )}
    </>
  );
};

export default ChatBot;





















