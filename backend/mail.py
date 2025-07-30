from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
import os
import resend

# Load environment variables
load_dotenv()

# Flask app setup
app = Flask(__name__)
CORS(app, origins=["https://ai-platform-dash.onrender.com"])
# Resend setup
resend.api_key = os.getenv("RESEND_API_KEY")
RECEIVER_EMAIL = os.getenv("RECEIVER_EMAIL")

@app.route("/contact", methods=["POST"])
def contact():
    data = request.get_json()
    name = data.get("name", "").strip()
    email = data.get("email", "").strip()
    message = data.get("message", "").strip()

    if not name or not email or not message:
        return jsonify({"success": False, "message": "All fields are required."}), 400

    try:
        html_content = f"""
            <p><strong>Name:</strong> {name}</p>
            <p><strong>Email:</strong> {email}</p>
            <p><strong>Message:</strong><br>{message.replace('\n', '<br>')}</p>
        """

        r = resend.Emails.send({
            "from": "onboarding@resend.dev",  # Keep default unless domain is verified
            "to": RECEIVER_EMAIL,
            "subject": f"New Contact Message from {name}",
            "reply_to": email,
            "html": html_content,
        })

        return jsonify({"success": True, "message": "Message sent!"}), 200

    except Exception as e:
        print("❌ Error:", e)
        return jsonify({"success": False, "message": "Failed to send email."}), 500

if __name__ == "__main__":
    app.run(debug=True)
