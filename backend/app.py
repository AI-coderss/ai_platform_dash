import os
import tempfile
from uuid import uuid4
import json
import re
import base64
import threading
import requests

from dotenv import load_dotenv
from flask import Flask, request, jsonify, Response, stream_with_context


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
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
if not OPENAI_API_KEY:
    raise ValueError("OPENAI_API_KEY not found. Please set it in your .env file.")

app = Flask(__name__)
# IMPORTANT: Use the correct origins for production
CORS(app, origins=["https://ai-platform-dash.onrender.com", "http://localhost:3000"])


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

# === Real-Time Transcription with OpenAI's API Using WebRTC ===

OAI_BASE = "https://api.openai.com/v1"
HEADERS = {
    "Authorization": f"Bearer {OPENAI_API_KEY}",
    "Content-Type": "application/json",
    "OpenAI-Beta": "realtime=v1",   # required beta header
}

@app.get("/health")
def health():
    return {"ok": True}

@app.post("/realtime/token")
def realtime_token():
    """
    Create a Realtime Transcription Session and return its ephemeral client_secret.
    The browser will use this to authenticate its WebRTC exchange directly with OpenAI.
    """
    payload = {
        "model": "gpt-4o-transcribe",
        "input_audio_format": "pcm16",
        "input_audio_transcription": {
            "model": "gpt-4o-transcribe",
            # "language": "en",          # optional fixed language
            # "prompt": "",              # optional biasing prompt
        },
        "turn_detection": {
            "type": "server_vad",
            "threshold": 0.5,
            "prefix_padding_ms": 300,
            "silence_duration_ms": 500
        },
        "input_audio_noise_reduction": { "type": "near_field" },
        "expires_in": 60  # short-lived
    }

    r = requests.post(
        f"{OAI_BASE}/realtime/transcription_sessions",
        headers=HEADERS,
        data=json.dumps(payload),
        timeout=15
    )
    if r.status_code >= 400:
        return jsonify({"error": r.text}), r.status_code

    data = r.json()
    client_secret = (data.get("client_secret") or {}).get("value")
    if not client_secret:
        return jsonify({"error": "No client_secret in response"}), 500

    return jsonify({
        "client_secret": client_secret,
        "session_id": data.get("id")
    })

# === Main Execution ===
if __name__ == "__main__":
     # No Socket.IO / WS server here; just REST.
    app.run(host="0.0.0.0", port=5050, debug=True)



