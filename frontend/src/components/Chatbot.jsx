/* eslint-disable no-loop-func */
import React, { useState, useRef, useLayoutEffect, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { motion, useMotionValue } from "framer-motion";
import ChatInputWidget from "./ChatInputWidget";
import "../styles/ChatBot.css";
import useCardStore from "./store/useCardStore";

/**
 * D-ID widget integration (draggable + docked behavior)
 * - We inject the D-ID script on first open.
 * - The widget starts DOCKED inside the chat body (when you close it, it returns there).
 * - When you click "Open Avatar", we FLOAT it in a draggable, fixed-position container.
 * - The draggable container has NO visible chrome; the widget itself is draggable.
 * - We re-parent the D-ID DOM between the dock and the floating container without removing the script.
 */

const DID_AGENT_SRC = "https://agent.d-id.com/v2/index.js";
const DID_SCRIPT_ID = "did-agent-loader-v2";
const DID_SELECTORS = [
  '[data-name="did-agent"]',
  "#did-agent",
  ".did-voice-agent",
  "[data-did-agent]",
];

// 👉 Use environment vars in production
const DID_CLIENT_KEY ="Z29vZ2xlLW9hdXRoMnwxMTI1MzgwMDI5NzAxNDIxMTMxNDI6TG5FLWVDS1IyaE9VMEcyS2FUVnh0";
const DID_AGENT_ID = "v2_agt_uxCkm0YX";

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

  const [sessionId] = useState(() => {
    const id = localStorage.getItem("chatbot-session") || crypto.randomUUID();
    localStorage.setItem("chatbot-session", id);
    return id;
  });

  // ---- D-ID: dock/float state ----
  const [isFloating, setIsFloating] = useState(false); // false = docked inside chat body
  const [didReady, setDidReady] = useState(false); // true when D-ID DOM found at least once
  const dockRef = useRef(null); // where the avatar lives when docked
  const floatMountRef = useRef(null); // where the avatar lives when floating
  const observerRef = useRef(null);

  // Drag positions for floating container
  const x = useMotionValue(
    typeof window !== "undefined" ? window.innerWidth - 360 : 0
  );
  const y = useMotionValue(
    typeof window !== "undefined" ? window.innerHeight - 420 : 0
  );

  // --- Helpers to find and re-parent the D-ID node ---
  const findDidNode = () => {
    for (const sel of DID_SELECTORS) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  };

  const neutralizeDidStyles = (el) => {
    // remove fixed positioning so our container fully controls placement
    el.style.position = "static";
    el.style.inset = "auto";
    el.style.right = "auto";
    el.style.left = "auto";
    el.style.bottom = "auto";
    el.style.top = "auto";
    el.style.margin = "0";
    el.style.maxWidth = "100%";
    // safety sweep inside
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
      // Attach to whichever container we're using now
      const target = isFloating ? floatMountRef.current : dockRef.current;
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
    // position is irrelevant—we re-parent and control placement
    s.dataset.position = "right";
    document.body.appendChild(s);
  };

  const openFloating = () => {
    setIsFloating(true);
    injectDidScript();
    startObserver();
    // if node already exists, move immediately
    setTimeout(() => {
      if (floatMountRef.current) attachTo(floatMountRef.current);
    }, 0);
  };

  const closeToDock = () => {
    // Move avatar back inside chat body (dock) and keep it there
    setIsFloating(false);
    // If node already exists, re-parent now
    setTimeout(() => {
      if (dockRef.current) attachTo(dockRef.current);
    }, 0);
  };

  // Keep chat scrolling to latest
  useLayoutEffect(() => {
    if (chatBodyRef.current) {
      requestAnimationFrame(() => {
        chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
      });
    }
  }, [messages, loading]);

  // On unmount: stop observing (we do NOT remove the widget)
  useEffect(() => {
    return () => {
      stopObserver();
    };
  }, []);

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

      // 🔁 Call /classify to get the appropriate card ID
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
      <button className="chat-toggle" onClick={() => setOpen(!open)}>
        <img src="/icons/chat.svg" alt="Chat" className="chat-icon" />
      </button>

      {open && window.innerWidth <= 768 && (
        <button className="chat-close-mobile" onClick={() => setOpen(false)}>
          ✖
        </button>
      )}

      {open && (
        <div className="chat-box">
          <div
            className="chat-header"
            style={{ background: "#2563eb", color: "#fff", fontWeight: 600 }}
          >
            AI Assistant
          </div>

          <div className="chat-body" ref={chatBodyRef}>
            {/* In-chat controls */}
            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                margin: "6px 8px 10px",
              }}
            >
              {!isFloating && (
                <button
                  onClick={openFloating}
                  className="predefined-q"
                  title="Open D-ID Avatar (draggable)"
                  style={{
                    background: "#0ea5e9",
                    color: "white",
                    borderRadius: 999,
                    padding: "6px 10px",
                    fontSize: 13,
                    border: "none",
                    boxShadow: "0 4px 14px rgba(0,0,0,0.12)",
                    cursor: "pointer",
                  }}
                >
                  🎭 Open Avatar
                </button>
              )}
            </div>

            {/* ---- DOCKED avatar lives here (inside chat body) ---- */}
            <div
              ref={dockRef}
              style={{
                width: "100%",
                minHeight: 72,
                display: isFloating ? "none" : "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "8px 6px",
                // light neutral background so it integrates with chat; adjust as you like
                background: "#f8fafc",
                borderRadius: 12,
                margin: "0 10px 10px",
                border: "1px solid #e5e7eb",
              }}
            >
              {!didReady && (
                <span style={{ color: "#64748b", fontSize: 12 }}>
                  Avatar will appear here. Click “Open Avatar” to pop it out and
                  drag anywhere.
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
              <div
                className="chat-msg bot loader"
                style={{ alignSelf: "flex-start" }}
              >
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
                    <span
                      className={`chevron ${accordionOpen ? "rotate" : ""}`}
                    >
                      ▼
                    </span>
                  </div>
                  <div
                    className={`accordion-body ${accordionOpen ? "open" : ""}`}
                  >
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
        </div>
      )}

      {/* ---- FLOATING, DRAGGABLE avatar container (no visual chrome) ---- */}
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
            // Make the container itself invisible so only the widget is perceived.
            background: "transparent",
          }}
        >
          {/* Close button: tiny and unobtrusive; no black bar */}
          <button
            onClick={closeToDock}
            title="Close (dock back to chat)"
            style={{
              position: "absolute",
              right: -8,
              top: -8,
              width: 24,
              height: 24,
              borderRadius: 12,
              border: "none",
              background: "rgba(0,0,0,0.6)",
              color: "#fff",
              fontSize: 12,
              lineHeight: "24px",
              textAlign: "center",
              cursor: "pointer",
              boxShadow: "0 2px 6px rgba(0,0,0,0.25)",
            }}
          >
            ✖
          </button>

          {/* Mount point for the actual D-ID widget (the widget itself is draggable now) */}
          <div
            ref={floatMountRef}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              // No backgrounds/frames; we show the widget as-is
            }}
          >
            {!didReady && (
              <span
                style={{
                  color: "#cbd5e1",
                  fontSize: 12,
                  background: "rgba(11,18,32,0.6)",
                  padding: "4px 8px",
                  borderRadius: 8,
                }}
              >
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
