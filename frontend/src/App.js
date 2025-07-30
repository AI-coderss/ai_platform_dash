import React, { useState, useEffect, useRef } from "react";
import "./App.css";
import ChatBot from "./components/Chatbot";
import HeroSection from "./components/HeroSection";
import ThemeToggle from "./components/ThemeToggle";
import useCardStore from "./components/store/useCardStore";
import AudioPlayer from "./components/AudioPlayer";

import ContactSection from "./components/ContactSection";

const audioMap = {
  1: "/assets/audio/ai_doctor.mp3",
  2: "/assets/audio/medical_transcription.mp3",
  3: "/assets/audio/data_analyst.mp3",
  4: "/assets/audio/report_enhancement.mp3",
  5: "/assets/audio/ivf_assistant.mp3",
  6: "/assets/audio/patient_assistant.mp3",
};

const AppCard = ({ app, onPlay }) => {
  const { activeCardId } = useCardStore();
  const isActive = activeCardId === app.id;
  const cardRef = useRef(null);
  const [isSpeaking, setIsSpeaking] = useState(false);

  useEffect(() => {
    if (isActive && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: "smooth", block: "center" });

      const handleStart = () => setIsSpeaking(true);
      const handleEnd = () => setIsSpeaking(false);

      window.speechSynthesis.addEventListener("start", handleStart);
      window.speechSynthesis.addEventListener("end", handleEnd);

      return () => {
        window.speechSynthesis.removeEventListener("start", handleStart);
        window.speechSynthesis.removeEventListener("end", handleEnd);
      };
    }
  }, [isActive]);

  return (
    <div
      ref={cardRef}
      className={`card animated-card ${isActive ? "highlight" : ""}`}
      tabIndex="0"
    >
      {isSpeaking && isActive && (
        <div className="audio-visualizer">
          {[...Array(6)].map((_, i) => (
            <span key={i} className="bar"></span>
          ))}
        </div>
      )}

      <div className="glow-border"></div>
      <div className="content">
        <img src={app.icon} alt={app.name} className="app-icon" />
        <h3 className="title">{app.name}</h3>
        <p className="copy">{app.description}</p>

        <div className="app-actions">
          <a href={app.link} className="btn" target="_blank" rel="noopener noreferrer">
            Launch
          </a>
          <button onClick={() => onPlay(app.helpVideo)} className="btn">
            Help
          </button>
        </div>

        {isActive && (
          <div className="audio-wrapper">
            <AudioPlayer src={audioMap[app.id]} key={audioMap[app.id]} />
          </div>
        )}
      </div>
    </div>
  );
};

const App = () => {
  const [videoUrl, setVideoUrl] = useState(null);
  const surveyUrl = "https://forms.visme.co/formsPlayer/zzdk184y-ai-applications-usage-at-dsah";
  const cardsRef = useRef(null); // For scrolling into view

  const apps = [
    {
      id: 1,
      name: "🧠 AI Doctor Assistant",
      description: "Get instant AI-powered medical opinions, based on the latest RAG technology",
      icon: "/icons/doctorAI.svg",
      link: "https://dsahdoctoraiassistantbot.onrender.com",
      helpVideo: "https://www.youtube.com/embed/FbEV-LrmZl0?autoplay=1&mute=1",
    },
    {
      id: 2,
      name: "📋 Medical Transcription App",
      description: "Generate structured medical notes from consultations, capture the essence of patient doctor conversation",
      icon: "/icons/hospital.svg",
      link: "https://medicaltranscription-version2-tests.onrender.com",
      helpVideo: "https://www.youtube.com/embed/24T0hx6AfAA?autoplay=1&mute=1",
    },
    {
      id: 3,
      name: "📊 AI-Powered Data Analyst",
      description: "Upload and analyze hospital data instantly, visualize the results, generate AI insights",
      icon: "/icons/dashboard.svg",
      link: "https://www.youtube.com/embed/FbEV-LrmZl0?autoplay=1&mute=1",
      helpVideo: "https://www.youtube.com/embed/FbEV-LrmZl0?autoplay=1&mute=1",
    },
    {
      id: 4,
      name: "🧠 Medical Report Enhancement App",
      description: "Enhance the quality of the generated Medical reports by leveraging AI",
      icon: "/icons/report.svg",
      link: "https://medical-report-editor-ai-powered-dsah.onrender.com",
      helpVideo: "https://www.youtube.com/embed/1amAKukvQ2Q?autoplay=1&mute=1",
    },
    {
      id: 5,
      name: "🧠 IVF Virtual Training Assistant",
      description: "Designed to assist IVF fellowships at DSAH using RAG technology",
      icon: "/icons/ivf.svg",
      link: "https://ivf-virtual-training-assistant-dsah.onrender.com",
      helpVideo: "https://www.youtube.com/embed/FbEV-LrmZl0?autoplay=1&mute=1",
    },
    {
      id: 6,
      name: "💬 Patient Assistant",
      description: "Voice assistant for patient navigation and booking",
      icon: "/icons/voice.svg",
      link: "https://www.youtube.com/embed/FbEV-LrmZl0?autoplay=1&mute=1",
      helpVideo: "https://www.youtube.com/embed/FbEV-LrmZl0?autoplay=1&mute=1",
    },
  ];

  return (
    <div className="container">
      {/* Background Effects */}
      <div className="background-elements">
        <div className="bg-blur bg-blur-1"></div>
        <div className="bg-blur bg-blur-2"></div>
        <div className="bg-blur bg-blur-3"></div>
        <div className="decorative-grid">
          {[...Array(12)].map((_, i) => (
            <div key={i} className="grid-line"></div>
          ))}
        </div>
      </div>

      <ThemeToggle />

      {/* Header */}
      <div className="header">
        <div className="logo-container">
          <img src="/assets/logo.png" alt="Hospital Logo" className="hospital-logo" />
        </div>
        <div className="title-block">
          <div id="BrushCursor">
            <div className="container">
              <div className="p p1">DSAH AI PLATFORM 🤖</div>
              <div className="p p2">DSAH AI PLATFORM 🤖</div>
              <div className="p p3">
                DSAH AI PLATFORM 🤖<div className="cursor"></div>
              </div>
            </div>
          </div>
          <p className="subtitle">Your single portal for all AI-powered applications</p>
        </div>
      </div>

      {/* Help Video Modal */}
      {videoUrl && (
        <div className="video-modal">
          <div className="video-wrapper">
            <button className="close-video" onClick={() => setVideoUrl(null)}>✖</button>
            <iframe
              src={videoUrl}
              title="Help Video"
              allow="autoplay; encrypted-media"
              allowFullScreen
            ></iframe>
          </div>
        </div>
      )}

      {/* Hero Section with scroll handler */}
      <HeroSection onExploreClick={() => {
        cardsRef.current?.scrollIntoView({ behavior: "smooth" });
      }} />

      {/* Cards Section */}
      <div className="page-content" ref={cardsRef}>
        {apps.map((app) => (
          <AppCard key={app.id} app={app} onPlay={setVideoUrl} />
        ))}
      </div>

      {/* Survey Floating Button */}
      <a
        href={surveyUrl}
        className="btn survey-fab-button"
        target="_blank"
        rel="noopener noreferrer"
        title="Take our Survey"
      >
        Take Survey 📝
      </a>

      <ChatBot />
    
      

      {/* Contact Section */}
      <ContactSection />

      {/* Footer */}


    </div>
  );
};

export default App;














