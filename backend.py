# --- FILE: backend.py ---
import os
import pypdf
import google.generativeai as genai
from duckduckgo_search import DDGS
from dotenv import load_dotenv
from personas import SALES_PERSONAS

# CONFIGURATION
load_dotenv()
# Suppress the Google Deprecation Warning to keep logs clean
import warnings
warnings.filterwarnings("ignore", category=FutureWarning)
warnings.filterwarnings("ignore", category=UserWarning)

genai.configure(api_key=os.environ["GOOGLE_API_KEY"])

# --- PHASE 0: PREREQUISITES (SYSTEM CONFIGURATION) ---

# 1. EXCLUSION LIST (Placeholder for Database Connection)
# In the future, this will connect to Salesforce/SQL.
EXCLUSION_LIST = [
    # "Example Company Inc.",
    # "Existing Client GmbH"
]

# 2. ASSET LOADERS
def load_perfect_customer_profile():
    """Loads the strict definition of a high-value Thales customer."""
    try:
        base_dir = os.path.dirname(os.path.abspath(__file__))
        path = os.path.join(base_dir, "knowledge_base", "Perfect Customer Profile.pdf")
        if not os.path.exists(path):
            return "Rule: Prioritize High-Revenue SaaS or Hybrid Hardware-Software companies."
        
        reader = pypdf.PdfReader(path)
        text = ""
        for page in reader.pages:
            text += page.extract_text() + "\n"
        return text
    except Exception:
        return "Rule: Prioritize High-Revenue SaaS or Hybrid Hardware-Software companies."

def load_general_knowledge():
    """Loads knowledge for Pain Points, Value Prop, and Important People."""
    base_dir = os.path.dirname(os.path.abspath(__file__))
    kb_dir = os.path.join(base_dir, "knowledge_base")
    context = ""
    if os.path.exists(kb_dir):
        for f in os.listdir(kb_dir):
            if f.endswith(".pdf") and "Perfect Customer Profile" not in f:
                path = os.path.join(kb_dir, f)
                try:
                    reader = pypdf.PdfReader(path)
                    for page in reader.pages:
                        context += page.extract_text() + "\n"
                except:
                    pass
    return context

# PRE-LOAD STATIC ASSETS
PCP_CONTENT = load_perfect_customer_profile()
GENERAL_KNOWLEDGE = load_general_knowledge()

# --- TOOL: SEARCH ---
def run_search(query):
    """Performs a live web search to find revenue, products, and roles."""
    try:
        results = DDGS().text(query, max_results=5)
        if results:
            return "\n".join([f"Title: {r['title']}\nSnippet: {r['body']}" for r in results])
        return "No results found."
    except Exception as e:
        return f"Search Error: {e}"

# --- THE LOGIC CORE (MASTER PLAN v3.0) ---
def analyze_company(user_input, persona_name):
    """
    Executes the Master Plan v3.0:
    Phase 0: Config & Exclusion Check
    Phase 1: Router (Region vs. Target)
    Phase 2: Gatekeeper (PCP Check) & Data Table
    Phase 3: Lead Enrichment (Roles)
    Phase 4: Drafting (Persona-based)
    """
    
    # 0. EXCLUSION CHECK (Hard Stop)
    # Simple string matching for now
    for blocked in EXCLUSION_LIST:
        if blocked.lower() in user_input.lower():
            return f"🚫 **STOP:** '{blocked}' is on the Exclusion List (Existing Customer)."

    # 1. PERSONA LOADING
    selected_persona = next((p for p in SALES_PERSONAS.values() if p["name"] == persona_name), None)
    style_guide = selected_persona["style_guide"] if selected_persona else "Professional Standard"

    # 2. SYSTEM INSTRUCTION (THE MASTER PLAN)
    system_instruction = f"""
    You are the **Thales Sales Automation Architect**. 
    You are executing "Master Plan v3.0" to find and engage high-value prospects.

    === PART 0: THE PREREQUISITES ===
    **The Perfect Customer Profile (PCP):**
    {PCP_CONTENT}

    **Your Persona (The Voice):**
    You must write the final email using THIS exact style:
    {style_guide}

    **Knowledge Base (Pain Points & Roles):**
    {GENERAL_KNOWLEDGE}

    === EXECUTION PIPELINE ===
    Analyze the user input: "{user_input}" and execute the following phases step-by-step.

    --- PHASE 1: THE INPUT TRIGGERS ---
    * **Trigger A (Regional Discovery):** If input is a Region + Quantity (e.g. "5 SaaS in Nordics").
        -> ACTION: Search for companies. List them with revenue. STOP. Do not draft emails.
    * **Trigger B/C (Target Analysis):** If input is a Company Name or URL.
        -> ACTION: Proceed to Phase 2.

    --- PHASE 2: THE PROFILING ENGINE (The Gatekeeper) ---
    1.  **Search:** Gather data on Business Model (SaaS/Hybrid), Revenue, and Products.
    2.  **Compare:** Check against the **PCP** defined above.
    3.  **DECISION NODE:**
        * **IF NO MATCH:** Output "🔴 **DISQUALIFIED**" and explain why (e.g. "Revenue too low", "No software product"). STOP.
        * **IF MATCH:** Generate the **Data Table** below and Proceed to Phase 3.
        
    * **REQUIRED DATA TABLE FORMAT:**
        | Metric | Data |
        | :--- | :--- |
        | **Company** | [Name] |
        | **Segment** | [Hardware / SaaS / Hybrid] |
        | **Revenue** | [Amount] |
        | **Thales Fit**| [High/Med/Low] |
        | **Core Pain** | [Identify 1 Major Challenge] |

    --- PHASE 3: LEAD ENRICHMENT (The Detective) ---
    1.  [cite_start]**Find Roles:** Search for specific Decision Makers defined in the Knowledge Base (VP Product, Head of Software) [cite: 3-5].
    2.  **Verify:** Ensure they are currently active.
    3.  **Output:** List the identified Target Person (Name & Role).

    --- PHASE 4: EXECUTION (The Mailroom) ---
    * **Action:** Draft an email to the Target Person identified in Phase 3.
    * **Content:**
        * [cite_start]Use the "Getting good insights" logic to map Pain Points to Thales Solutions [cite: 17-21].
        * Use the **Persona Style** defined in Part 0.
        * [cite_start]Ensure the "Value Proposition" is strong [cite: 28-34].
        * End with a clear Call to Action (CTA).

    === CRITICAL OUTPUT RULES ===
    1.  [cite_start]**Citations:** You MUST cite the Knowledge Base sources (e.g., [cite: 12]) when applying logic.
    2.  **Structure:** Use Markdown. Separate Phases clearly.
    3.  **Accuracy:** If you cannot find a specific person, state "Specific Contact Not Found - Recommended Role: VP of Product".
    """

    # 3. GENERATION
    model = genai.GenerativeModel(
        model_name='gemini-1.5-flash',
        tools=[run_search],
        system_instruction=system_instruction
    )
    
    # We use a chat session to allow the model to "think" through the search steps
    chat = model.start_chat(enable_automatic_function_calling=True)
    
    try:
        response = chat.send_message(f"Execute Master Plan for target: {user_input}")
        return response.text
    except Exception as e:
        return f"❌ **Error during analysis:** {str(e)}"