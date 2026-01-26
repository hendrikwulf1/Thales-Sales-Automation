import os
import pypdf
import traceback
import google.generativeai as genai
from googlesearch import search
from dotenv import load_dotenv

# Load API Keys
load_dotenv()
genai.configure(api_key=os.environ["GOOGLE_API_KEY"])

# --- 1. KNOWLEDGE LOADER ---
def load_knowledge_from_folder(folder_name):
    base_dir = os.path.dirname(os.path.abspath(__file__))
    knowledge_dir = os.path.join(base_dir, folder_name)
    combined_text = ""
    if not os.path.exists(knowledge_dir):
        return "NO KNOWLEDGE BASE FOUND."
    print(f"📂 Loading knowledge from: {knowledge_dir}")
    for filename in os.listdir(knowledge_dir):
        if filename.endswith(".pdf"):
            file_path = os.path.join(knowledge_dir, filename)
            try:
                reader = pypdf.PdfReader(file_path)
                file_text = ""
                for page in reader.pages:
                    file_text += page.extract_text() + "\n"
                combined_text += f"\n=== SOURCE: {filename} ===\n{file_text}\n"
                print(f"   ✅ Loaded: {filename}")
            except Exception as e:
                print(f"   ❌ Error reading {filename}: {e}")
    return combined_text

# --- 2. LOAD INTELLIGENCE ---
knowledge_context = load_knowledge_from_folder("knowledge_base")

# --- 3. SYSTEM INSTRUCTIONS ---
THALES_INSTRUCTIONS = f"""
You are the **Thales Software Monetization (SM) Sales Architect**.
Your goal is to analyze companies and draft outreach emails.

=== KNOWLEDGE BASE ===
{knowledge_context}
=== END KNOWLEDGE BASE ===

When you receive a Company Name, execute this workflow:
1. **SEARCH** Google for recent news and strategy.
2. [cite_start]**ANALYZE** pain points (Phase 1) [cite: 17-21].
3. [cite_start]**IDENTIFY** key roles (Phase 2) [cite: 4-8].
4. [cite_start]**DRAFT** the email (Phase 3) [cite: 46-48].

Always cite your sources using.
"""

# --- 4. SEARCH TOOL ---
def google_search_tool(query: str):
    """Performs a Google Search to find recent news and strategy."""
    print(f"\n   🔎 [SYSTEM] SEARCHING GOOGLE FOR: '{query}'...")
    try:
        results = search(query, num_results=5, advanced=True)
        search_summary = ""
        for result in results:
            search_summary += f"Title: {result.title}\nDesc: {result.description}\n\n"
        return search_summary
    except Exception as e:
        return f"Search failed: {e}"

# --- 5. INITIALIZE NATIVE ENGINE ---
# We use the native generative model which is more stable than the Agent wrapper
model = genai.GenerativeModel(
    model_name='gemini-flash-latest',
    tools=[google_search_tool],
    system_instruction=THALES_INSTRUCTIONS
)

# Start a chat session with automatic function calling enabled
chat_session = model.start_chat(enable_automatic_function_calling=True)

# --- 6. EXECUTION LOOP ---
if __name__ == "__main__":
    print("\n" + "="*40)
    print("🤖 THALES AGENT: NATIVE ENGINE ONLINE")
    print("="*40)
    print("👉 Type a company name to start (e.g., 'Siemens Energy')")
    print("👉 Type 'exit' to quit.\n")

    while True:
        try:
            user_input = input("\n(You) > ")
            if user_input.lower() in ["exit", "quit"]:
                print("👋 Shutting down.")
                break
            if not user_input.strip():
                continue

            print(f"   ... Agent is thinking ...")
            
            # Send message to the native chat session
            response = chat_session.send_message(user_input)
            
            # Print the text result
            print("\n" + "-"*20 + " AGENT RESPONSE " + "-"*20)
            print(response.text)
            print("-" * 56)

        except KeyboardInterrupt:
            print("\n👋 Force Quit.")
            break
        except Exception as e:
            print(f"\n❌ ERROR: {e}")
            traceback.print_exc()