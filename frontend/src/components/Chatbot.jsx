import React, { useState, useRef, useLayoutEffect } from "react";
import ReactMarkdown from "react-markdown";
import ChatInputWidget from "./ChatInputWidget";
import "../styles/ChatBot.css";
import useCardStore from "./store/useCardStore";

const initialQuestions = [
  "What can the AI Doctor Assistant do?",
  "How does the Medical Transcription App work?",
  "Can the Data Analyst show me hospital insights?",
  "How can I enhance a medical report using AI?",
  "Tell me more about the IVF Virtual Training Assistant.",
  "Can the Patient Assistant help with navigation?",
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

  const triggerCardMatch = (text) => {
    const matchMap = [
      { keywords: ["doctor", "opinion", "ai doctor"], id: 1 },
      { keywords: ["transcription", "note"], id: 2 },
      { keywords: ["analyst", "dashboard", "insights"], id: 3 },
      { keywords: ["report", "enhance"], id: 4 },
      { keywords: ["ivf", "training"], id: 5 },
      { keywords: ["patient", "voice", "navigation"], id: 6 },
    ];

    // Reset active card before trying to find a new match
    setActiveCardId(null); 
    for (let entry of matchMap) {
      if (entry.keywords.some((kw) => text.toLowerCase().includes(kw))) {
        setActiveCardId(entry.id);
        break; // Stop after the first match
      }
    }
  };

  const handleSendMessage = async ({ text }) => {
    if (!text?.trim()) return;

    const userMsg = { type: "user", text };
    setMessages((prev) => [...prev, userMsg]);
    setAccordionOpen(false);
    setLoading(true);

    try {
      const response = await fetch(
        "https://ai-platform-dsah-backend-chatbot.onrender.com/stream",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text, session_id: sessionId }),
        }
      );

      if (!response.ok || !response.body) {
        throw new Error("Streaming failed");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let botText = "";
      setMessages((prev) => [...prev, { type: "bot", text: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        botText += decoder.decode(value, { stream: true });
        // eslint-disable-next-line no-loop-func
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { type: "bot", text: botText };
          return updated;
        });
      }

      // Trigger card match after the full response is received
      triggerCardMatch(botText);
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

  useLayoutEffect(() => {
    if (chatBodyRef.current) {
      requestAnimationFrame(() => {
        chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
      });
    }
  }, [messages, loading]);

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
    </>
  );
};

export default ChatBot;

















