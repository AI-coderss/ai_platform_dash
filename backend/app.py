import os
import tempfile
from uuid import uuid4
from datetime import datetime
import json
import re
import base64
import random
import asyncio

from dotenv import load_dotenv
from flask import Flask, request, jsonify, Response, stream_with_context,render_template
from flask_socketio import SocketIO, emit
import websockets
import eventlet
from flask_cors import CORS
import qdrant_client
from openai import OpenAI
from prompts.prompt import engineeredprompt
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_qdrant import Qdrant
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain.chains import create_history_aware_retriever, create_retrieval_chain
from langchain.chains.combine_documents import create_stuff_documents_chain

# Load env vars
load_dotenv()
openai_api_key = os.getenv("OPENAI_API_KEY")
if not openai_api_key:
    raise ValueError("OPENAI_API_KEY not found. Please set it in your .env file.")

app = Flask(__name__)
CORS(app, origins=["https://ai-platform-dash.onrender.com"])
app.config['SECRET_KEY'] = 'a_secret_key'
socketio = SocketIO(app, async_mode='eventlet', cors_allowed_origins="*")

# OpenAI Realtime API URL
OPENAI_REALTIME_URL = "wss://api.openai.com/v1/realtime"
# The model can be changed as new versions are released
MODEL = "gpt-4o-realtime-preview"
chat_sessions = {}
collection_name = os.getenv("QDRANT_COLLECTION_NAME")

# Initialize OpenAI client
client = OpenAI()

# === VECTOR STORE ===
def get_vector_store():
    qdrant = qdrant_client.QdrantClient(
        url=os.getenv("QDRANT_HOST"),
        api_key=os.getenv("QDRANT_API_KEY"),
        timeout=60.0
    )
    embeddings = OpenAIEmbeddings()
    return Qdrant(client=qdrant, collection_name=collection_name, embeddings=embeddings)

vector_store = get_vector_store()

# === RAG Chain ===
def get_context_retriever_chain():
    llm = ChatOpenAI(model="gpt-4o")
    retriever = vector_store.as_retriever()
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

# === /stream ===
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

        # === Pure RAG only ===
        try:
            for chunk in conversation_rag_chain.stream(
                {"chat_history": chat_sessions[session_id], "input": user_input}
            ):
                token = chunk.get("answer", "")
                answer += token
                yield token
        except Exception as e:
            yield f"\n[Vector error: {str(e)}]"

        # Save session
        chat_sessions[session_id].append({"role": "user", "content": user_input})
        chat_sessions[session_id].append({"role": "assistant", "content": answer})

    return Response(
        stream_with_context(generate()),
        content_type="text/plain",
        headers={"Access-Control-Allow-Origin": "https://ai-platform-dash.onrender.com"}
    )

# === /generate ===
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

# === /tts ===
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
    audio_file = "temp_audio.mp3"
    response.stream_to_file(audio_file)
    with open(audio_file, "rb") as f:
        audio_bytes = f.read()
    audio_base64 = base64.b64encode(audio_bytes).decode("utf-8")
    return jsonify({"audio_base64": audio_base64})

# === /reset ===
@app.route("/reset", methods=["POST"])
def reset():
    session_id = request.json.get("session_id")
    if session_id in chat_sessions:
        del chat_sessions[session_id]
    return jsonify({"message": "Session reset"}), 200
# === /generate-followups ===
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
        match = re.search(r'\[(.*?)\]', text, re.DOTALL)
        questions = json.loads(f"[{match.group(1)}]") if match else []
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
# Active WebSocket connections to OpenAI
openai_connections = {}

async def handle_openai_connection(ws, sid):
    """Manages the WebSocket connection to OpenAI for a specific client."""
    try:
        headers = {
            "Authorization": f"Bearer {openai_api_key}",
            "OpenAI-Beta": "realtime=v1"
        }

        url_with_model = f"{OPENAI_REALTIME_URL}?model={MODEL}"
        
        async with websockets.connect(url_with_model, extra_headers=headers) as openai_ws:
            print(f"[{sid}] Connected to OpenAI Realtime API.")
            openai_connections[sid] = openai_ws

            # Configure the session for transcription
            await openai_ws.send(json.dumps({
                "type": "session.update",
                "session": {
                    "input_audio_transcription": {"model": MODEL},
                    "input_audio_format": "pcm16"
                }
            }))

            # Listen for and forward transcription events from OpenAI
            async for message in openai_ws:
                data = json.loads(message)
                if data.get("type") == "conversation.item.input_audio_transcription.completed":
                    transcript = data.get("transcript")
                    print(f"[{sid}] Transcription: {transcript}")
                    socketio.emit('transcript_update', {'text': transcript}, room=sid)
                elif data.get("type") == "error":
                    print(f"[{sid}] Error from OpenAI: {data['error']['message']}")
                    socketio.emit('error', {'message': f"OpenAI error: {data['error']['message']}"}, room=sid)

    except websockets.exceptions.ConnectionClosed as e:
        print(f"[{sid}] OpenAI connection closed: {e}")
    except Exception as e:
        print(f"[{sid}] An error occurred with OpenAI connection: {e}")
    finally:
        if sid in openai_connections:
            del openai_connections[sid]

@app.route('/')
def index():
    return "This is the server. Your React client should handle the UI."

@socketio.on('connect')
def handle_connect():
    print(f"Client {request.sid} connected")
    # Start a background task for the OpenAI connection
    socketio.start_background_task(handle_openai_connection, None, request.sid)

@socketio.on('disconnect')
def handle_disconnect():
    print(f"Client {request.sid} disconnected")
    # Clean up the OpenAI connection for this client
    if request.sid in openai_connections:
        eventlet.spawn(openai_connections[request.sid].close())
        del openai_connections[request.sid]

@socketio.on('audio_data')
def handle_audio_data(data):
    """Receives audio data from the client and forwards it to OpenAI."""
    sid = request.sid
    if sid in openai_connections:
        try:
            audio_bytes = base64.b64decode(data['audio'])
            
            # Forward the raw audio bytes to OpenAI's WebSocket
            eventlet.spawn(openai_connections[sid].send, json.dumps({
                "type": "input_audio_buffer.append",
                "audio": base64.b64encode(audio_bytes).decode('utf-8')
            }))
        except Exception as e:
            print(f"[{sid}] Error forwarding audio data: {e}")
            socketio.emit('error', {'message': 'Error processing audio.'}, room=sid)


# === Run ===
if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5050, debug=True)




