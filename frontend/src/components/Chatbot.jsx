/* eslint-disable no-loop-func */
import React, { useState, useRef, useLayoutEffect, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import ChatInputWidget from "./ChatInputWidget";
import "../styles/ChatBot.css";
import useCardStore from "./store/useCardStore";

/**
 * D-ID agent is injected on demand when the user presses "Open Avatar".
 * We no longer re-parent or wrap it in a draggable container.
 */

const DID_AGENT_SRC = "https://agent.d-id.com/v2/index.js";
const DID_SCRIPT_ID = "did-agent-loader-v2";

// 👉 use your real key/id or env vars.
const DID_CLIENT_KEY = "Z29vZ2xlLW9hdXRoMnwxMTI1MzgwMDI5NzAxNDIxMTMxNDI6TG5FLWVDS1IyaE9VMEcyS2FUVnh0";
const DID_AGENT_ID = "v2_agt_uxCkm0YX";

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

  const [sessionId] = useState(() => {
    const id = localStorage.getItem("chatbot-session") || crypto.randomUUID();
    localStorage.setItem("chatbot-session", id);
    return id;
  });

  // Inject D-ID script on demand (no draggable wrapper)
  const injectDidScript = () => {
    if (typeof document === "undefined") return;
    if (document.getElementById(DID_SCRIPT_ID)) return; // already injected

    const s = document.createElement("script");
    s.type = "module";
    s.async = true;
    s.src = DID_AGENT_SRC;
    s.id = DID_SCRIPT_ID;

    // data-* attributes to configure the agent
    s.dataset.mode = "fabio";
    s.dataset.clientKey = DID_CLIENT_KEY;
    s.dataset.agentId = DID_AGENT_ID;
    s.dataset.name = "did-agent";
    s.dataset.monitor = "true";
    s.dataset.orientation = "horizontal";
    s.dataset.position = "right";

    document.body.appendChild(s);
  };

  const openDid = () => {
    injectDidScript();
  };

  // Keep scroll pinned to bottom while streaming
  useLayoutEffect(() => {
    if (chatBodyRef.current) {
      requestAnimationFrame(() => {
        chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
      });
    }
  }, [messages, loading]);

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

      // 🔁 classify -> setActiveCardId
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

  useEffect(() => {}, []);

  return (
    <>
      {/* Your existing Chat FAB */}
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
            {/* In-chat controls row */}
            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                margin: "6px 8px 10px",
                alignItems: "center",
              }}
            >
              {/* >>> Smaller 3D pulsing rectangular button (external CSS) <<< */}
              <button
                onClick={openDid}
                aria-label="Open D-ID Avatar"
                className="open-avatar-3d"
                title="Open D-ID Avatar"
              >
                <span className="open-avatar-icon">🎭</span>
                <span>Open Avatar</span>
              </button>
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
        </div>
      )}
    </>
  );
};

export default ChatBot;






















