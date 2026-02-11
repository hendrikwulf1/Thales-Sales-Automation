# --- FILE: backend.py ---
import os
import time
import pypdf
import google.generativeai as genai
from google.api_core import exceptions
from duckduckgo_search import DDGS
from dotenv import load_dotenv
from personas import SALES_PERSONAS

# CONFIGURATION
load_dotenv()
import warnings
warnings.filterwarnings("ignore", category=FutureWarning)
warnings.filterwarnings("ignore", category=UserWarning)

# Configure API
api_key = os.environ.get("GOOGLE_API_KEY")
if not api_key:
    raise ValueError("GOOGLE_API_KEY not found in .env file")
genai.configure(api_key=api_key)

# --- ROBUST MODEL LIST ---
# The Agent will try these in order until one works.
# We prioritize 1.5 versions because they don't require billing verification.
MODEL_PRIORITY_LIST = [
    "gemini-1.5-flash",        # Standard (15 RPM)
    "gemini-1.5-flash-8b",     # High Volume (Often separate quota)
    "gemini-1.5-pro",          # Smarter, lower rate limit (2 RPM)
    "gemini-1.0-pro"           # Old faithful (Legacy backup)
]

# --- PHASE 0: PREREQUISITES ---
EXCLUSION_LIST = ["Example Company Inc.", "Thales"]

def load_knowledge_base():
    # Combines PCP and General Knowledge into one text block
    base_dir = os.path.dirname(os.path.abspath(__file__))
    kb_dir = os.path.join(base_dir, "knowledge_base")
    combined_text = "Rule: Prioritize High-Revenue SaaS/Hybrid companies.\n"
    
    if os.path.exists(kb_dir):
        for f in os.listdir(kb_dir):
            if f.endswith(".pdf"):
                try:
                    reader = pypdf.PdfReader(os.path.join(kb_dir, f))
                    for page in reader.pages: combined_text += page.extract_text() + "\n"
                except: pass
    return combined_text

KB_CONTENT = load_knowledge_base()

# --- TOOL: SEARCH ---
def run_search(query):
    try:
        # Reduced to 5 results to save processing tokens
        results = DDGS().text(query, max_results=5)
        if results:
            return "\n".join([f"Title: {r['title']}\nSnippet: {r['body']}" for r in results])
        return "No results found."
    except Exception as e:
        return f"Search Error: {e}"

# --- THE SELF-HEALING ENGINE ---
def try_generate_content(prompt, system_instruction):
    """
    Tries models one by one. If one fails (404 or 429), it moves to the next.
    """
    last_error = ""
    
    for model_name in MODEL_PRIORITY_LIST:
        print(f"🤖 Trying Brain: {model_name}...")
        try:
            model = genai.GenerativeModel(
                model_name=model_name,
                tools=[run_search],
                system_instruction=system_instruction
            )
            chat = model.start_chat(enable_automatic_function_calling=True)
            response = chat.send_message(prompt)
            return response.text  # If successful, return immediately
            
        except exceptions.ResourceExhausted:
            print(f"⚠️ {model_name} is exhausted (429). Switching...")
            last_error = f"Quota exceeded on {model_name}"
            time.sleep(1) # Brief pause before next try
            continue
        except exceptions.NotFound:
            print(f"⚠️ {model_name} not found (404). Switching...")
            last_error = f"Model {model_name} not found"
            continue
        except Exception as e:
            print(f"⚠️ Unexpected error on {model_name}: {e}")
            last_error = str(e)
            continue

    # If we loop through ALL models and fail:
    raise Exception(f"All models failed. Last error: {last_error}")

# --- MAIN LOGIC ---
def analyze_company(user_input, persona_name):
    # 0. EXCLUSION CHECK
    for blocked in EXCLUSION_LIST:
        if blocked.lower() in user_input.lower():
            return f"🚫 **STOP:** '{blocked}' is on the Exclusion List."

    # 1. PERSONA LOADING
    selected_persona = next((p for p in SALES_PERSONAS.values() if p["name"] == persona_name), None)
    style_guide = selected_persona["style_guide"] if selected_persona else "Professional Standard"

    # 2. SYSTEM INSTRUCTION
    system_instruction = f"""
    You are the **Thales Sales Automation Architect**. 
    Execute "Master Plan v3.1" to find, verify, and engage prospects.

    === KNOWLEDGE BASE ===
    {KB_CONTENT}

    === YOUR VOICE ===
    {style_guide}

    === INSTRUCTIONS ===
    Target: "{user_input}"
    1. **Search**: Check Business Model, Revenue, and Key Roles (VP Product/Head of Eng).
    2. **Pattern Hunt**: Search for 'email format {user_input}' to deduce the email pattern.
    3. **Verify**: Compare against the Perfect Customer Profile.
    4. **Draft**: Write the email in the requested persona.

    !!! IMPORTANT OUTPUT RULE !!!
    You MUST enclose the **Final Email Draft** (Subject and Body only) inside these XML tags:
    <email_draft>
    Subject: ...
    Hi [Name],
    ...
    </email_draft>
    """

    # 3. CALL THE SELF-HEALING ENGINE
    try:
        return try_generate_content(f"Analyze {user_input}", system_instruction)
    except Exception as e:
        return f"❌ **System Failure:** {str(e)}\n\n*Tip: If you see this, wait 10 minutes. You may have hit the daily cap for ALL free models.*"