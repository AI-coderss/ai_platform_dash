import React, { useState, useCallback, useRef, useEffect } from "react";
import io from "socket.io-client";
import { useReactMediaRecorder } from "react-media-recorder";
import SendIcon from "@mui/icons-material/Send";
import MicIcon from "@mui/icons-material/Mic";
import StopIcon from "@mui/icons-material/Stop";
import "../styles/ChatInputWidget.css";

const socket = io("https://ai-platform-dsah-backend-chatbot.onrender.com", { transports: ['websocket'] });

const ChatInputWidget = ({ onSendMessage }) => {
  const [inputText, setInputText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const textAreaRef = useRef(null);
  const transcriptionRef = useRef("");

  const { startRecording, stopRecording, mediaBlobUrl, mediaStream } = useReactMediaRecorder({ audio: true });

  useEffect(() => {
    // Set up WebSocket event listeners
    socket.on('connect', () => {
      console.log('Connected to server');
    });

    socket.on('transcript_update', (data) => {
      const newTranscript = data.text;
      transcriptionRef.current += (transcriptionRef.current ? " " : "") + newTranscript;
      setInputText(transcriptionRef.current);
      adjustTextAreaHeight();
    });

    socket.on('error', (data) => {
      console.error('Server error:', data.message);
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from server');
    });

    // Clean up on component unmount
    return () => {
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    let recorder;
    if (isRecording && mediaStream) {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioContext.createMediaStreamSource(mediaStream);
      
      recorder = audioContext.createScriptProcessor(4096, 1, 1);
      recorder.onaudioprocess = function(e) {
        if (socket.connected) {
          const audioData = e.inputBuffer.getChannelData(0);
          const pcm16Data = int16FromFloat32(audioData);
          const base64Audio = arrayBufferToBase64(pcm16Data.buffer);
          socket.emit('audio_data', { audio: base64Audio });
        }
      };

      source.connect(recorder);
      recorder.connect(audioContext.destination);

      return () => {
        if (recorder) {
          recorder.disconnect();
          recorder.onaudioprocess = null;
        }
        if (audioContext) {
          audioContext.close();
        }
      };
    }
  }, [isRecording, mediaStream]);

  const handleRecordingStop = useCallback(async () => {
    if (mediaBlobUrl) {
      // You can add logic here to send the final audio blob if needed
      console.log("Final audio blob captured:", mediaBlobUrl);
    }
  }, [mediaBlobUrl]);

  const startLiveTranscription = () => {
    transcriptionRef.current = "";
    setInputText("");
    startRecording();
    setIsRecording(true);
  };

  const stopLiveTranscription = () => {
    stopRecording();
    handleRecordingStop();
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

  useEffect(() => {
    adjustTextAreaHeight();
  }, []);

  const handleInputChange = (event) => {
    const newValue = event.target.value;
    setInputText(newValue);
    adjustTextAreaHeight();
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (inputText.trim().length > 0) {
        handleSendMessage();
      }
    }
  };

  const handleSendMessage = () => {
    if (inputText.trim().length > 0) {
      onSendMessage({ text: inputText });
      setInputText("");
      adjustTextAreaHeight(true);
    }

    if (isRecording) {
      stopLiveTranscription();
    }
  };

  const handleIconClick = () => {
    if (inputText.trim().length > 0) {
      handleSendMessage();
    } else {
      if (isRecording) {
        stopLiveTranscription();
      } else {
        startLiveTranscription();
      }
    }
  };
  
  // Helper functions for audio processing
  const int16FromFloat32 = (input) => {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      output[i] = (s < 0 ? s * 0x8000 : s * 0x7FFF);
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
        style={{ resize: "none", overflow: "hidden" }}
      />
      <button className="icon-btn" onClick={handleIconClick}>
        {inputText.trim().length > 0 ? (
          <SendIcon />
        ) : isRecording ? (
          <StopIcon />
        ) : (
          <MicIcon />
        )}
      </button>
    </div>
  );
};

export default ChatInputWidget;

