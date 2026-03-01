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
    "gemini-1.5-flash",        # Fallback 1
    "gemini-1.5-pro"           # Fallback 2 (Smarter, but lower rate limit)
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
    # 2. SYSTEM INSTRUCTION (UPDATED FOR V3.1)
    system_instruction = f"""
    You are the **Thales Sales Automation Architect**. 
    Execute "Master Plan v3.1" to find, verify, and engage prospects.

    === KNOWLEDGE BASE ===
    {KB_CONTENT}

    === TARGET DEFINITION (STRICT ABM FOCUS) ===
    You must identify 6 to 7 current, highly warm decision-makers at the target company (scale down to 3-4 only if it is a very small firm). 
    Do NOT search for or generate email addresses. We only want highly accurate Names and Roles.
    
    You are RESTRICTED to finding employees who hold one of the following roles (or very close variations):
    1. VP / Director of IT / Enterprise Systems
    2. Chief Technology Officer (CTO)
    3. Chief Product Officer (CPO)
    4. Director of Pricing & Monetization
    5. VP / Director of Revenue Operations (RevOps) / Business Ops
    6. VP / Director of Engineering (or R&D)
    7. VP / Director of Product Management

    Output format for contacts: 
    - Full Name | Exact Job Title 

    === VALUE PROPOSITION ANALYSIS ===
    Before drafting an email, you must build a "Why [Company] is a strong prospect for Thales SM" analysis.
    Follow this exact structure:
    1. Short overview of how the company delivers value.
    2. Section: "Why [Company] is a strong prospect for Thales SM".
    3. Break the value down into 3-4 specific challenges and solutions.
       * For each, name the challenge, explain why it exists for them, and explain how Thales Sentinel (LDK, RMS, Cloud, EMS, HL, etc.) solves it.
       * End each point with a clear business outcome.
    Ensure this is industry-specific and tailored to their real products. Map this to recent strategies found on their website.

    === YOUR VOICE, STYLE, AND TONE === 
    You must adopt the exact writing DNA, style, tone, length, and structure of this specific Sales Rep Persona: 
    {style_guide} 
    
    CRITICAL INSTRUCTION: Analyze the example emails provided in the persona guide above. Your generated email MUST look and feel exactly like this specific persona wrote it. 
    - Mimic their typical openings, closings, sentence length, and formatting habits. 
    - Do NOT force a generic 4-paragraph structure if it contradicts how this persona naturally writes. 
    
    While perfectly matching their unique style, naturally weave in the information you gathered during your Value Proposition Analysis. Ensure the email: 
    * References specific initiatives of the target company. 
    * Introduces Thales Sentinel (securing, licensing, monetizing software) in a way that fits the rep's voice. 
    * Closes with a request for a 20-minute conversation.

    !!! IMPORTANT OUTPUT RULE !!!
    Enclose the **Final Email Draft** inside these XML tags:
    <email_draft>
    Subject: ...
    Hi [Name of the most relevant stakeholder found above],
    ...
    </email_draft>
    """
    # 3. CALL THE SELF-HEALING ENGINE
    try:
        return try_generate_content(f"Analyze {user_input}", system_instruction)
    except Exception as e:
        return f"❌ **System Failure:** {str(e)}\n\n*Tip: If you see this, wait 10 minutes. You may have hit the daily cap for ALL free models.*"