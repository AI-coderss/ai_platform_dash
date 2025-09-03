import os, json, logging, requests
import tempfile
from uuid import uuid4
import json
import re
import base64
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

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("rtc-transcribe")

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
COMMON_JSON_HEADERS = {
    "Authorization": f"Bearer {OPENAI_API_KEY}",
    "Content-Type": "application/json",
    "OpenAI-Beta": "realtime=v1",
}

@app.get("/api/health")
def health():
    return {"ok": True}

@app.post("/api/rtc-transcribe-connect")
def rtc_transcribe_connect():
    """
    Browser sends an SDP offer (text).
    We:
      1) Create a Realtime Transcription Session -> ephemeral client_secret
      2) POST the browser SDP to OpenAI Realtime WebRTC endpoint with ?intent=transcription
         (DO NOT pass model here; model is defined by the session)
      3) Return the answer SDP (text/plain) back to the browser
    """
    offer_sdp = request.get_data(as_text=True)
    if not offer_sdp:
        return Response("No SDP provided", status=400)

    # 1) Create ephemeral transcription session
    # Keep payload conservative to avoid "unknown parameter" errors.
    session_payload = {
        "input_audio_format": "pcm16",
        "input_audio_transcription": {
            "model": "gpt-4o-transcribe"  # choose the streaming STT model
        },
        "turn_detection": {
            "type": "server_vad",
            "threshold": 0.5,
            "prefix_padding_ms": 300,
            "silence_duration_ms": 500
        },
        "input_audio_noise_reduction": { "type": "near_field" }
        # Do NOT pass top-level "model" or other undocumented fields here.
    }

    try:
        sess = requests.post(
            f"{OAI_BASE}/realtime/transcription_sessions",
            headers=COMMON_JSON_HEADERS,
            data=json.dumps(session_payload),
            timeout=20
        )
    except Exception as e:
        log.exception("Failed to create transcription session")
        return Response(f"Session error: {e}", status=502)

    if not sess.ok:
        log.error("Session create failed (%s): %s", sess.status_code, sess.text)
        return Response(sess.text or "Failed to create session", status=sess.status_code)

    client_secret = (sess.json().get("client_secret") or {}).get("value")
    if not client_secret:
        log.error("Missing client_secret in session response")
        return Response("Missing client_secret", status=502)

    # 2) Exchange SDP with Realtime endpoint using ephemeral secret
    # IMPORTANT: Do NOT send model here. Use only intent=transcription.
    sdp_headers = {
        "Authorization": f"Bearer {client_secret}",
        "Content-Type": "application/sdp",
        "OpenAI-Beta": "realtime=v1",
    }
    upstream_url = f"{OAI_BASE}/realtime"
    params = {"intent": "transcription"}
    log.info("Posting SDP offer to %s with params=%s", upstream_url, params)

    try:
        ans = requests.post(
            upstream_url,
            params=params,
            headers=sdp_headers,
            data=offer_sdp,
            timeout=30
        )
    except Exception as e:
        log.exception("SDP exchange error")
        return Response(f"SDP exchange error: {e}", status=502)

    if not ans.ok:
        # Pass upstream body so the frontend can log exact error text
        log.error("SDP exchange failed (%s): %s", ans.status_code, ans.text)
        return Response(ans.text or "SDP exchange failed", status=ans.status_code)

    answer_sdp = ans.text.strip()
    if not answer_sdp.startswith("v="):
        # Not an SDP body; surface it for easier debugging
        log.error("Upstream returned non-SDP body: %s", answer_sdp[:2000])
        return Response(f"Non-SDP response from upstream:\n{answer_sdp}",
                        status=502, mimetype="text/plain")

    # 3) Return raw SDP answer
    return Response(answer_sdp, status=200, mimetype="application/sdp")

# === Main Execution ===
if __name__ == "__main__":
     # No Socket.IO / WS server here; just REST.
    app.run(host="0.0.0.0", port=5050, debug=True)



