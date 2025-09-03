import os
import tempfile
from uuid import uuid4
import json
import re
import base64
import threading

from dotenv import load_dotenv
from flask import Flask, request, jsonify, Response, stream_with_context
from flask_socketio import SocketIO
import eventlet
from flask_cors import CORS
import qdrant_client
from openai import OpenAI
import websocket # <-- REPLACED websockets with websocket-client

from prompts.prompt import engineeredprompt
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_qdrant import Qdrant
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain.chains import create_history_aware_retriever, create_retrieval_chain
from langchain.chains.combine_documents import create_stuff_documents_chain

# Ensure eventlet patches the standard libraries
eventlet.monkey_patch()

# Load env vars
load_dotenv()
openai_api_key = os.getenv("OPENAI_API_KEY")
if not openai_api_key:
    raise ValueError("OPENAI_API_KEY not found. Please set it in your .env file.")

app = Flask(__name__)
# IMPORTANT: Use the correct origins for production
CORS(app, origins=["https://ai-platform-dash.onrender.com", "http://localhost:3000"])
app.config['SECRET_KEY'] = 'a_very_secret_key'
socketio = SocketIO(app, async_mode='eventlet', cors_allowed_origins="*")

# === UPDATED for new OpenAI Real-Time Transcription API ===
OPENAI_REALTIME_URL = "wss://api.openai.com/v1/realtime?intent=transcription"
TRANSCRIPTION_MODEL = "gpt-4o-transcribe"
# ==========================================================

chat_sessions = {}
collection_name = os.getenv("QDRANT_COLLECTION_NAME")

# Initialize OpenAI client
client = OpenAI()

# Active WebSocket connections to OpenAI
openai_connections = {}

# === VECTOR STORE & RAG ===
def get_vector_store():
    qdrant = qdrant_client.QdrantClient(
        url=os.getenv("QDRANT_HOST"),
        api_key=os.getenv("QDRANT_API_KEY"),
        timeout=60.0
    )
    embeddings = OpenAIEmbeddings()
    return Qdrant(client=qdrant, collection_name=collection_name, embeddings=embeddings)

def get_context_retriever_chain():
    llm = ChatOpenAI(model="gpt-4o")
    retriever = get_vector_store().as_retriever()
    prompt = ChatPromptTemplate.from_messages([
        MessagesPlaceholder("chat_history"),
        ("user", "{input}"),
        ("user", "Given the above conversation, generate a search query to look up in order to get information relevant to the conversation"),
    ])
    return create_history_aware_retriever(llm, retriever, prompt)

def get_conversational_rag_chain():
    retriever_chain = get_context_retriever_chain()
    llm = ChatOpenAI(model="gpt-4o")
    prompt = ChatPromptTemplate.from_messages([
        ("system", engineeredprompt),
        MessagesPlaceholder("chat_history"),
        ("user", "{input}"),
    ])
    return create_retrieval_chain(retriever_chain, create_stuff_documents_chain(llm, prompt))

conversation_rag_chain = get_conversational_rag_chain()

# === Standard HTTP Routes ===
@app.route("/")
def index():
    return "Real-time transcription server is running."

@app.route("/stream", methods=["POST"])
def stream():
    data = request.get_json()
    session_id = data.get("session_id", str(uuid4()))
    user_input = data.get("message")
    if not user_input:
        return jsonify({"error": "No input message"}), 400

    if session_id not in chat_sessions:
        chat_sessions[session_id] = []

    def generate():
        answer = ""
        try:
            for chunk in conversation_rag_chain.stream(
                {"chat_history": chat_sessions[session_id], "input": user_input}
            ):
                token = chunk.get("answer", "")
                answer += token
                yield token
        except Exception as e:
            yield f"\n[Vector error: {str(e)}]"

        chat_sessions[session_id].append({"role": "user", "content": user_input})
        chat_sessions[session_id].append({"role": "assistant", "content": answer})

    return Response(stream_with_context(generate()), content_type="text/plain")


@app.route("/generate", methods=["POST"])
def generate():
    data = request.get_json()
    session_id = data.get("session_id", str(uuid4()))
    user_input = data.get("message", "")
    if not user_input:
        return jsonify({"error": "No input message"}), 400
    if session_id not in chat_sessions:
        chat_sessions[session_id] = []
    response = conversation_rag_chain.invoke(
        {"chat_history": chat_sessions[session_id], "input": user_input}
    )
    answer = response["answer"]
    chat_sessions[session_id].append({"role": "user", "content": user_input})
    chat_sessions[session_id].append({"role": "assistant", "content": answer})
    return jsonify({"response": answer, "session_id": session_id})

@app.route("/tts", methods=["POST"])
def tts():
    text = (request.json or {}).get("text", "").strip()
    if not text:
        return jsonify({"error": "No text supplied"}), 400

    response = client.audio.speech.create(
        model="tts-1",
        voice="fable",
        input=text
    )
    # Using a temporary file to handle the audio stream
    with tempfile.NamedTemporaryFile(delete=True, suffix='.mp3') as fp:
        response.stream_to_file(fp.name)
        fp.seek(0)
        audio_bytes = fp.read()
    
    audio_base64 = base64.b64encode(audio_bytes).decode("utf-8")
    return jsonify({"audio_base64": audio_base64})

@app.route("/reset", methods=["POST"])
def reset():
    session_id = request.json.get("session_id")
    if session_id in chat_sessions:
        del chat_sessions[session_id]
    return jsonify({"message": "Session reset"}), 200

@app.route("/generate-followups", methods=["POST"])
def generate_followups():
    data = request.get_json()
    last_answer = data.get("last_answer", "")
    if not last_answer:
        return jsonify({"followups": []})

    followup_prompt = (
        f"Based on the following assistant response, generate 3 short and helpful follow-up questions "
        f"that the user might want to ask next:\n\n{last_answer}\n\n"
        f"Format the response as a JSON array of strings."
    )

    try:
        completion = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "You are a helpful assistant."},
                {"role": "user", "content": followup_prompt}
            ],
            temperature=0.7
        )

        text = completion.choices[0].message.content.strip()
        # A more robust way to find and parse the JSON array
        match = re.search(r'\[.*?\]', text, re.DOTALL)
        if match:
            questions = json.loads(match.group(0))
        else:
            questions = []
        return jsonify({"followups": questions})

    except Exception as e:
        print(f"Error generating followups: {e}")
        return jsonify({"followups": []})

@app.route("/classify", methods=["POST"])
def classify_question():
    data = request.get_json()
    question = data.get("question")
    ai_response = data.get("ai_response")

    prompt = f"""
You are an intelligent AI routing assistant. Given a user's question and AI response,
determine the most relevant card ID from the following:

1: AI Doctor Assistant
2: Medical Transcription App
3: Data Analyst Dashboard
4: Medical Report Enhancement Tool
5: IVF Virtual Training Assistant
6: Patient Navigation Assistant

Return only the ID as a number (1-6). No text, no explanation.

Question: {question}
Response: {ai_response}
"""

    completion = client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "system", "content": prompt}],
        temperature=0.0,
    )

    result = completion.choices[0].message.content.strip()
    try:
        card_id = int(result)
    except:
        card_id = None

    return jsonify({"card_id": card_id})

# === REAL-TIME TRANSCRIPTION LOGIC (REFACTORED) ===

def on_message(ws, message, sid):
    """Callback function to handle messages from OpenAI."""
    try:
        data = json.loads(message)
        # The new API sends transcription results in 'transcription_item.completed' events
        if data.get("type") == "transcription_item.completed":
            transcript = data.get("item", {}).get("text")
            if transcript:
                print(f"[{sid}] Transcription: {transcript}")
                socketio.emit('transcript_update', {'text': transcript}, room=sid)
        elif data.get("type") == "error":
            error_message = data.get("error", {}).get("message", "Unknown OpenAI error")
            print(f"[{sid}] Error from OpenAI: {error_message}")
            socketio.emit('error', {'message': f"OpenAI error: {error_message}"}, room=sid)
    except json.JSONDecodeError:
        print(f"[{sid}] Received non-JSON message: {message}")
    except Exception as e:
        print(f"[{sid}] Error processing message from OpenAI: {e}")

def on_error(ws, error, sid):
    """Callback for WebSocket errors."""
    print(f"[{sid}] OpenAI WebSocket Error: {error}")
    if sid in openai_connections:
        del openai_connections[sid]

def on_close(ws, close_status_code, close_msg, sid):
    """Callback for when the connection to OpenAI is closed."""
    print(f"[{sid}] OpenAI connection closed: {close_status_code} - {close_msg}")
    if sid in openai_connections:
        del openai_connections[sid]

def on_open(ws, sid):
    """Callback for when the connection to OpenAI is established."""
    print(f"[{sid}] Connected to OpenAI Realtime API.")
    
    # === UPDATED session configuration payload ===
    session_config = {
        "type": "transcription_session.update",
        "input_audio_format": "pcm16",
        "input_audio_transcription": {
            "model": TRANSCRIPTION_MODEL,
        },
        "turn_detection": {
            "type": "server_vad",
            "silence_duration_ms": 500,
        },
    }
    ws.send(json.dumps(session_config))

def handle_openai_connection(sid):
    """Manages the WebSocket connection to OpenAI for a specific client."""
    headers = {"Authorization": f"Bearer {openai_api_key}"}
    
    ws_app = websocket.WebSocketApp(
        OPENAI_REALTIME_URL,
        header=headers,
        on_open=lambda ws: on_open(ws, sid),
        on_message=lambda ws, msg: on_message(ws, msg, sid),
        on_error=lambda ws, err: on_error(ws, err, sid),
        on_close=lambda ws, code, msg: on_close(ws, code, msg, sid)
    )
    
    openai_connections[sid] = ws_app
    ws_app.run_forever()


@socketio.on('connect')
def handle_connect():
    sid = request.sid
    print(f"Client connected: {sid}")
    # Start a background green thread for the OpenAI connection
    socketio.start_background_task(handle_openai_connection, sid)

@socketio.on('disconnect')
def handle_disconnect():
    sid = request.sid
    print(f"Client disconnected: {sid}")
    # Clean up the OpenAI connection for this client
    if sid in openai_connections:
        openai_connections[sid].close()
        del openai_connections[sid]

@socketio.on('audio_data')
def handle_audio_data(data):
    """Receives audio data from the client and forwards it to OpenAI."""
    sid = request.sid
    if sid in openai_connections and openai_connections[sid].sock and openai_connections[sid].sock.connected:
        try:
            # The client already sends base64, so we just wrap it in the API's required format.
            audio_payload = {
                "type": "input_audio_buffer.append",
                "audio": data['audio']
            }
            openai_connections[sid].send(json.dumps(audio_payload))
        except Exception as e:
            print(f"[{sid}] Error forwarding audio data: {e}")
    else:
        print(f"[{sid}] Cannot send audio, OpenAI connection not ready or closed.")

# === Main Execution ===
if __name__ == "__main__":
    # Use socketio.run for development to ensure eventlet is used correctly
    socketio.run(app, host="127.0.0.1", port=5050, debug=True)



