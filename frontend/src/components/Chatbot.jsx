import React, { useState, useRef, useLayoutEffect } from "react";
import ReactMarkdown from "react-markdown";
import ChatInputWidget from "./ChatInputWidget";
import "../styles/ChatBot.css";

const initialQuestions = [
  "How do I use the medical report platform?",
  "How does the medical transcription app work?",
  "What are the key features of these AI tools?",
  "Is it available on mobile devices?",
  "Can I download the report as PDF?",
];

const ChatBot = () => {
  const [open, setOpen] = useState(false);
  const [accordionOpen, setAccordionOpen] = useState(false);
  const [messages, setMessages] = useState([
    { type: "bot", text: "Hi! Ask me anything about these AI tools." },
  ]);
  const [visibleQuestions, setVisibleQuestions] = useState(initialQuestions);
  const [followUps, setFollowUps] = useState([]);
  const [openAccordion, setOpenAccordion] = useState(null);
  const [loading, setLoading] = useState(false);
  const chatBodyRef = useRef(null);

  const [sessionId] = useState(() => {
    const id = localStorage.getItem("chatbot-session") || crypto.randomUUID();
    localStorage.setItem("chatbot-session", id);
    return id;
  });

  const getEmoji = (question) => {
    if (question.includes("platform")) return "🖥️";
    if (question.includes("transcription")) return "📝";
    if (question.includes("features")) return "✨";
    if (question.includes("mobile")) return "📱";
    if (question.includes("PDF")) return "📄";
    if (question.includes("AI")) return "🤖";
    if (question.includes("tools")) return "🛠️";
    return "❓";
  };

  const toggleAccordion = (index) => {
    setOpenAccordion((prev) => (prev === index ? null : index));
  };

  const handleSendMessage = async ({ text }) => {
    if (!text?.trim()) return;

    const userMsg = { type: "user", text };
    setMessages((prev) => [...prev, userMsg]);
    setFollowUps([]);
    setOpenAccordion(null);
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

      // Fetch dependent follow-up questions
      try {
        const followupRes = await fetch(
          "https://ai-platform-dsah-backend-chatbot.onrender.com/generate-followups",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ last_answer: botText }),
          }
        );
        const followupJson = await followupRes.json();
        setFollowUps(followupJson.followups || []);
      } catch (e) {
        console.warn("Could not fetch follow-ups", e);
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

  const handleFollowupClick = (question) => {
    setFollowUps([]);
    handleSendMessage({ text: question });
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

          {/* ✅ Accordion-based Follow-up Questions */}
          {followUps.length > 0 && (
            <div className="faq-section">
              <h2 className="faq-title">Suggested Follow-Up Questions</h2>
              {followUps.map((q, i) => (
                <div
                  key={i}
                  className={`faq-item ${i === openAccordion ? "active" : ""}`}
                  onClick={() => toggleAccordion(i)}
                >
                  <div className="faq-question">
                    {getEmoji(q)} {q}
                  </div>
                  <div
                    className="faq-answer"
                    style={{ display: i === openAccordion ? "block" : "none" }}
                  >
                    <button
                      className="faq-answer-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleFollowupClick(q);
                      }}
                    >
                      Ask this
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ✅ Initial Predefined Questions */}
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
                          {getEmoji(q)} {q}
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
                    {getEmoji(q)} {q}
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













