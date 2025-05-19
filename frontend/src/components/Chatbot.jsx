import React, { useState, useRef, useEffect } from "react";
import axios from "axios";
import ReactMarkdown from "react-markdown";
import ChatInputWidget from "./ChatInputWidget";
import "../styles/ChatBot.css";

const ChatBot = () => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    { type: "bot", text: "Hi! Ask me anything about these AI tools." }
  ]);
  const [loading, setLoading] = useState(false);
  const chatBodyRef = useRef(null);

  const handleSendMessage = async ({ text }) => {
    if (!text?.trim()) return;

    const userMsg = { type: "user", text };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const res = await axios.post(
        "https://ai-platform-dsah-backend-chatbot.onrender.com/chat",
        { message: text }
      );
      const botMsg = {
        type: "bot",
        text: res.data.response || "🤖 Sorry, I didn't catch that."
      };
      setMessages((prev) => [...prev, botMsg]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { type: "bot", text: "⚠️ Error contacting server." }
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (chatBodyRef.current) {
      chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
    }
  }, [messages, loading]);

  return (
    <>
      <button className="chat-toggle" onClick={() => setOpen(!open)}>
        <img src="/icons/chat.svg" alt="Chat" className="chat-icon" />
      </button>

      {open && (
        <div className="chat-box">
          <div className="chat-header">AI Assistant</div>
          <div className="chat-body" ref={chatBodyRef}>
            {messages.map((msg, idx) => (
              <div key={idx} className={`chat-msg ${msg.type}`}>
                {msg.type === "bot" ? (
                  <ReactMarkdown>{msg.text}</ReactMarkdown>
                ) : (
                  msg.text
                )}
              </div>
            ))}
            {loading && (
              <div className="chat-msg bot loader">
                <span className="dot"></span>
                <span className="dot"></span>
                <span className="dot"></span>
              </div>
            )}
          </div>
          <ChatInputWidget onSendMessage={handleSendMessage} />
        </div>
      )}
    </>
  );
};

export default ChatBot;






