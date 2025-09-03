import React, { useState,  useRef, useEffect } from "react";
import io from "socket.io-client";
import { useReactMediaRecorder } from "react-media-recorder";
import SendIcon from "@mui/icons-material/Send";
import MicIcon from "@mui/icons-material/Mic";
import StopIcon from "@mui/icons-material/Stop";
import "../styles/ChatInputWidget.css";

// The socket URL should be an environment variable in a real app
const SOCKET_URL = "https://ai-platform-dsah-backend-chatbot.onrender.com";

const ChatInputWidget = ({ onSendMessage }) => {
  const [inputText, setInputText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const textAreaRef = useRef(null);
  const transcriptionRef = useRef("");
  const socketRef = useRef(null);

  const { startRecording, stopRecording, mediaStream } = useReactMediaRecorder({ audio: true });

  // Connect and manage socket connection
  useEffect(() => {
    // Initialize socket connection
    socketRef.current = io(SOCKET_URL, {
      transports: ['websocket'],
      reconnectionAttempts: 5,
    });

    socketRef.current.on('connect', () => {
      console.log('Socket connected:', socketRef.current.id);
    });

    socketRef.current.on('transcript_update', (data) => {
      console.log("Received transcript:", data.text);
      // Append the new transcript segment. OpenAI sends completed phrases/sentences.
      const newTranscript = data.text;
      transcriptionRef.current += (transcriptionRef.current ? " " : "") + newTranscript;
      setInputText(transcriptionRef.current);
      adjustTextAreaHeight();
    });

    socketRef.current.on('error', (data) => {
      console.error('Server error:', data.message);
    });

    socketRef.current.on('disconnect', () => {
      console.log('Socket disconnected.');
    });

    // Cleanup on component unmount
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  // Handle audio processing when recording
  useEffect(() => {
    if (!isRecording || !mediaStream) return;

    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioContext.createMediaStreamSource(mediaStream);
    
    // Note: ScriptProcessorNode is deprecated but widely supported.
    // For future-proofing, consider using AudioWorklet.
    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    
    processor.onaudioprocess = (e) => {
      if (socketRef.current && socketRef.current.connected) {
        const audioData = e.inputBuffer.getChannelData(0);
        const pcm16Data = int16FromFloat32(audioData);
        const base64Audio = arrayBufferToBase64(pcm16Data.buffer);
        socketRef.current.emit('audio_data', { audio: base64Audio });
      }
    };

    source.connect(processor);
    processor.connect(audioContext.destination);

    return () => {
      source.disconnect();
      processor.disconnect();
      audioContext.close();
    };
  }, [isRecording, mediaStream]);

  // --- Helper Functions for Audio ---
  const int16FromFloat32 = (input) => {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return output;
  };

  const arrayBufferToBase64 = (buffer) => {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  };
  
  // --- UI Handlers ---

  const startLiveTranscription = () => {
    transcriptionRef.current = "";
    setInputText("");
    startRecording();
    setIsRecording(true);
  };

  const stopLiveTranscription = () => {
    stopRecording();
    setIsRecording(false);
  };
  
  const adjustTextAreaHeight = (reset = false) => {
    if (textAreaRef.current) {
      textAreaRef.current.style.height = "auto";
      if (!reset) {
        textAreaRef.current.style.height = `${textAreaRef.current.scrollHeight}px`;
      }
    }
  };

  const handleInputChange = (event) => {
    setInputText(event.target.value);
    adjustTextAreaHeight();
  };

  const handleSendMessage = () => {
    const messageText = inputText.trim();
    if (messageText.length > 0) {
      onSendMessage({ text: messageText });
      setInputText("");
      transcriptionRef.current = "";
      adjustTextAreaHeight(true);
    }
    if (isRecording) {
      stopLiveTranscription();
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSendMessage();
    }
  };

  const handleIconClick = () => {
    if (inputText.trim().length > 0) {
      handleSendMessage();
    } else {
      isRecording ? stopLiveTranscription() : startLiveTranscription();
    }
  };

  useEffect(() => {
    adjustTextAreaHeight();
  }, [inputText]);

  return (
    <div className="chat-container">
      <textarea
        ref={textAreaRef}
        className="chat-input"
        placeholder="Chat in text or start speaking..."
        value={inputText}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        rows={1}
      />
      <button className="icon-btn" onClick={handleIconClick} aria-label={inputText.trim() ? "Send" : (isRecording ? "Stop recording" : "Start recording")}>
        {inputText.trim().length > 0 ? (
          <SendIcon />
        ) : isRecording ? (
          <StopIcon className="recording" />
        ) : (
          <MicIcon />
        )}
      </button>
    </div>
  );
};

export default ChatInputWidget;
