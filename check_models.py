import os
import google.generativeai as genai
from dotenv import load_dotenv

# 1. Load the .env file (where your key is actually stored)
load_dotenv()

# 2. Get the key using the correct NAME
api_key = os.environ.get("GOOGLE_API_KEY")

if not api_key:
    print("❌ Error: GOOGLE_API_KEY not found. Please check your .env file.")
else:
    # 3. Configure the AI with the key
    genai.configure(api_key=api_key)

    print(f"🔍 Checking available models for Key starting with: {api_key[:5]}...")
    try:
        for m in genai.list_models():
            # We only want models that generate text
            if 'generateContent' in m.supported_generation_methods:
                print(f"✅ AVAILABLE: {m.name}")
    except Exception as e:
        print(f"❌ Error talking to Google: {e}")