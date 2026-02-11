# --- FILE: backend.py ---
import os
import pypdf
import google.generativeai as genai
from duckduckgo_search import DDGS
from dotenv import load_dotenv
from personas import SALES_PERSONAS

# CONFIGURATION
load_dotenv()
import warnings
warnings.filterwarnings("ignore", category=FutureWarning)
warnings.filterwarnings("ignore", category=UserWarning)

# Configure the API Key
api_key = os.environ.get("GOOGLE_API_KEY")
if not api_key:
    raise ValueError("GOOGLE_API_KEY not found in .env file")
genai.configure(api_key=api_key)

# --- PHASE 0: PREREQUISITES ---
EXCLUSION_LIST = ["Example Company Inc.", "Thales"]

def load_perfect_customer_profile():
    try:
        base_dir = os.path.dirname(os.path.abspath(__file__))
        path = os.path.join(base_dir, "knowledge_base", "Perfect Customer Profile.pdf")
        if not os.path.exists(path): return "Rule: Prioritize High-Revenue SaaS/Hybrid companies."
        reader = pypdf.PdfReader(path)
        text = ""
        for page in reader.pages: text += page.extract_text() + "\n"
        return text
    except: return "Rule: Prioritize High-Revenue SaaS/Hybrid companies."

def load_general_knowledge():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    kb_dir = os.path.join(base_dir, "knowledge_base")
    context = ""
    if os.path.exists(kb_dir):
        for f in os.listdir(kb_dir):
            if f.endswith(".pdf") and "Perfect Customer Profile" not in f:
                try:
                    reader = pypdf.PdfReader(os.path.join(kb_dir, f))
                    for page in reader.pages: context += page.extract_text() + "\n"
                except: pass
    return context

# Load assets once on startup
PCP_CONTENT = load_perfect_customer_profile()
GENERAL_KNOWLEDGE = load_general_knowledge()

# --- TOOL: SEARCH ---
def run_search(query):
    """
    Performs a live web search. 
    Crucial for finding email patterns and validating roles.
    """
    try:
        # Increased to 7 results to find better email patterns
        results = DDGS().text(query, max_results=7)
        if results:
            return "\n".join([f"Title: {r['title']}\nSnippet: {r['body']}" for r in results])
        return "No results found."
    except Exception as e:
        return f"Search Error: {e}"

# --- THE LOGIC CORE (MASTER PLAN v3.1) ---
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

    === PART 0: PREREQUISITES ===
    **The Perfect Customer Profile (PCP):**
    {PCP_CONTENT}

    **Your Persona (The Voice):**
    {style_guide}

    **Knowledge Base:**
    {GENERAL_KNOWLEDGE}

    === EXECUTION PIPELINE ===
    Target: "{user_input}"

    --- PHASE 1: ROUTER ---
    * If input is Region + Quantity -> List companies. STOP.
    * If input is Company Name -> Proceed to Phase 2.

    --- PHASE 2: GATEKEEPER ---
    1. Search for Business Model & Revenue.
    2. COMPARE against PCP.
    3. IF NO MATCH: Output "🔴 DISQUALIFIED" and explain why. STOP.
    4. IF MATCH: Generate Data Table & Proceed.

    --- PHASE 3: LEAD & EMAIL FORENSICS (The Detective) ---
    1.  **Identify the Role:** Search for "VP of Product" or "Head of Software".
    2.  **Pattern Discovery (CRITICAL):** * Execute a Search for: 'email format {user_input}' OR 'contact {user_input} email address'.
        * Look for public signals (e.g., "j.doe@company.com" vs "john.doe@company.com").
        * Deduce the pattern and apply it to the Target Person's name.
    3.  **Output:** Target Name, Role, Verified/Estimated Email.

    --- PHASE 4: DRAFTING (CRITICAL FORMATTING) ---
    Draft an email to the Target Person using the **Persona Style**.
    Map Pain Points to Thales Solutions (Sentinel/LDK).

    !!! IMPORTANT OUTPUT RULE !!!
    You MUST enclose the **Final Email Draft** (Subject and Body only) inside these XML tags:
    <email_draft>
    Subject: ...
    Hi [Name],
    ...
    </email_draft>
    
    Anything outside these tags will be considered "Research Notes" and will NOT be sent to the email client.
    """

    # 3. GENERATION
    # Using 'gemini-flash-latest' for high rate limits (avoiding 429 errors)
    try:
        model = genai.GenerativeModel(
            model_name='gemini-2.0-flash-lite-001', 
            tools=[run_search],
            system_instruction=system_instruction
        )
        
        chat = model.start_chat(enable_automatic_function_calling=True)
        response = chat.send_message(f"Execute Master Plan for target: {user_input}")
        return response.text
    except Exception as e:
        # Fallback if the specific model name fails
        return f"❌ **Error during analysis:** {str(e)}"