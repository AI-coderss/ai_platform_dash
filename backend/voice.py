from flask import Flask, request, Response, jsonify
from flask_cors import CORS
import requests
import os
import json
import logging
from dotenv import load_dotenv
from langchain_openai import OpenAIEmbeddings
from langchain_qdrant import Qdrant
import qdrant_client
from prompts.system_prompt import SYSTEM_PROMPT

# Load environment variables from .env
load_dotenv()

app = Flask(__name__)

CORS(app, resources={
    r"/api/*": {
        "origins": "https://ai-platform-dash.onrender.com",
        "methods": ["GET", "POST", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization"]
    }
})

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- Environment Variables & Constants ---
OPENAI_API_KEY = os.getenv('OPENAI_API_KEY')
if not OPENAI_API_KEY:
    logger.error("OPENAI_API_KEY not set.")
    raise EnvironmentError("OPENAI_API_KEY environment variable not set.")

OPENAI_SESSION_URL = "https://api.openai.com/v1/realtime/sessions"
OPENAI_API_URL = "https://api.openai.com/v1/realtime"
OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions"

MODEL_ID = "gpt-4o" 
VOICE = "alloy"
DEFAULT_INSTRUCTIONS = SYSTEM_PROMPT

# --- Tool Definition for Vision (remains the same) ---
VISION_TOOL_SCHEMA = {
    "type": "function",
    "function": {
        "name": "vision_frame",
        "description": "Analyzes the user's current screen to provide visual guidance. This is called when the user asks a question about what they are seeing on their screen, such as 'What do I click next?' or 'Where is the save button?'. The image is provided automatically.",
        "parameters": {
            "type": "object",
            "properties": {
                "prompt": {
                    "type": "string",
                    "description": "The user's specific question about the visual content on their screen. For example, 'What should I click next?' or 'Describe the layout of this page.'"
                },
                "image": {
                    "type": "string",
                    "description": "The current frame from the user's screen share, automatically captured and provided as a base64-encoded string.",
                    "format": "byte"
                }
            },
            "required": ["prompt", "image"]
        }
    }
}


def get_vector_store():
    client = qdrant_client.QdrantClient(url=os.getenv("QDRANT_HOST"), api_key=os.getenv("QDRANT_API_KEY"))
    embeddings = OpenAIEmbeddings()
    return Qdrant(client=client, collection_name=os.getenv("QDRANT_COLLECTION_NAME"), embeddings=embeddings)

vector_store = get_vector_store()

@app.route('/')
def home():
    return "Flask API is running!"

@app.route('/api/rtc-connect', methods=['POST'])
def connect_rtc():
    try:
        client_sdp = request.get_data(as_text=True)
        if not client_sdp:
            return Response("No SDP provided", status=400)

        # Step 1: Create Realtime session with tools defined
        # REMOVED the invalid "tool_config" parameter
        session_payload = {
            "model": MODEL_ID,
            "voice": VOICE,
            "instructions": DEFAULT_INSTRUCTIONS,
            "tools": [VISION_TOOL_SCHEMA]
        }
        headers = {
            "Authorization": f"Bearer {OPENAI_API_KEY}",
            "Content-Type": "application/json"
        }
        session_resp = requests.post(OPENAI_SESSION_URL, headers=headers, json=session_payload)
        
        # Check for a failed response and log the body
        if not session_resp.ok:
            logger.error(f"Session create failed: {session_resp.text}")
            return Response("Failed to create realtime session", status=session_resp.status_code)

        token_data = session_resp.json()
        ephemeral_token = token_data.get("client_secret", {}).get("value")
        if not ephemeral_token:
            logger.error("Ephemeral token missing")
            return Response("Missing ephemeral token", status=500)

        # Step 2: SDP exchange (remains the same)
        sdp_headers = {"Authorization": f"Bearer {ephemeral_token}", "Content-Type": "application/sdp"}
        sdp_resp = requests.post(
            OPENAI_API_URL,
            headers=sdp_headers,
            params={"model": MODEL_ID, "voice": VOICE},
            data=client_sdp
        )
        if not sdp_resp.ok:
            logger.error(f"SDP exchange failed: {sdp_resp.text}")
            return Response("SDP exchange error", status=500)

        return Response(sdp_resp.content, status=200, mimetype='application/sdp')

    except Exception as e:
        logger.exception("RTC connection error")
        return Response(f"Error: {e}", status=500)

# This endpoint is now called by the frontend, not by OpenAI
@app.route('/api/execute-vision-tool', methods=['POST'])
def execute_vision_tool():
    """Executes the vision_frame tool and returns the analysis."""
    try:
        data = request.json
        tool_call_id = data.get("tool_call_id")
        arguments = data.get("arguments", {})
        
        if not tool_call_id or not arguments:
             return jsonify({"error": "Missing tool_call_id or arguments"}), 400

        user_prompt = arguments.get("prompt", "Describe what you see on the screen.")
        image_b64 = arguments.get("image")

        if not image_b64:
            return jsonify({"error": "No image data provided in tool call"}), 400

        logger.info(f"Analyzing image for prompt: '{user_prompt}'")

        # Call OpenAI Chat Completions API with vision capabilities
        vision_payload = {
            "model": "gpt-4o",
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": user_prompt},
                        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_b64}"}}
                    ]
                }
            ],
            "max_tokens": 300
        }
        vision_headers = {"Authorization": f"Bearer {OPENAI_API_KEY}", "Content-Type": "application/json"}
        vision_response = requests.post(OPENAI_CHAT_COMPLETIONS_URL, headers=vision_headers, json=vision_payload)
        vision_response.raise_for_status()

        analysis_result = vision_response.json()["choices"][0]["message"]["content"]
        logger.info(f"Vision analysis result: {analysis_result}")
        
        # Return only the result string to the client
        return jsonify({"result": analysis_result}), 200

    except Exception as e:
        logger.exception("Error in tool execution handler")
        return jsonify({"error": str(e)}), 500


@app.route('/api/search', methods=['POST'])
def search():
    try:
        query = request.json.get('query')
        if not query:
            return jsonify({"error": "No query provided"}), 400

        logger.info(f"Searching for: {query}")
        results = vector_store.similarity_search_with_score(query, k=3)
        formatted = [{"content": doc.page_content, "metadata": doc.metadata, "relevance_score": float(score)} for doc, score in results]
        return jsonify({"results": formatted})

    except Exception as e:
        logger.error(f"Search error: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=8813)