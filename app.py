# --- FILE: app.py ---
import sys
import os
import re
import urllib.parse

# --- PATH PATCH ---
# Forces Python to look in the current folder for backend.py and personas.py
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import streamlit as st
from backend import analyze_company 
from personas import SALES_PERSONAS

# 1. Page Config
st.set_page_config(page_title="Thales Sales Agent", page_icon="🤖", layout="wide")

# 2. Sidebar: Persona Selector
st.sidebar.title("👤 Identity")
persona_names = [p["name"] for p in SALES_PERSONAS.values()]
selected_user_name = st.sidebar.selectbox("Who are you?", persona_names)
st.sidebar.info(f"Drafting emails as: **{selected_user_name}**")

# 3. Main Content
st.title("🤖 Thales Sales Automation Agent")
st.markdown("### 🎯 Lead Enrichment & Outreach Generator (v3.1)")

# Input Area
with st.form("analysis_form"):
    company_name = st.text_input("Enter Target Company Name:", placeholder="e.g. Siemens Energy")
    submitted = st.form_submit_button("🚀 Launch Analysis")

# 4. Execution Logic
if submitted and company_name:
    # Visual feedback
    with st.spinner(f"🔍 Researching {company_name}, finding email patterns, and drafting..."):
        
        try:
            # CALL THE BRAIN
            result = analyze_company(company_name, selected_user_name)
            
            # --- DISPLAY THE RESEARCH (THE WHOLE ANALYSIS) ---
            st.success("Analysis Complete!")
            st.markdown("---")
            st.markdown(result)
            
            # --- CLEANING LOGIC FOR EMAIL BUTTON ---
            
            # 1. Extract Target Email Address (for the "To:" field)
            email_match = re.search(r'[\w.+-]+@[\w-]+\.[\w.-]+', result)
            target_email = email_match.group(0) if email_match else ""

            # 2. Extract ONLY the Clean Draft (Subject + Body)
            # This looks for the <email_draft> tags we put in backend.py
            draft_match = re.search(r'<email_draft>(.*?)</email_draft>', result, re.DOTALL)
            
            if draft_match:
                # We found the clean tag!
                clean_email_content = draft_match.group(1).strip()
                
                # Separate Subject line from Body (assuming first line is Subject)
                lines = clean_email_content.split('\n', 1)
                
                # Clean up "Subject:" prefix if it exists
                raw_subject = lines[0].replace("Subject:", "").strip()
                raw_body = lines[1].strip() if len(lines) > 1 else clean_email_content
                
            else:
                # Fallback: If AI forgot tags, use specific Subject but generic Body
                raw_subject = f"Question regarding Software Monetization at {company_name}"
                raw_body = "Could not extract clean draft. Please copy text manually."
            
            # 3. Create the Safe Link
            # We encode the text so it works as a URL
            subject_encoded = urllib.parse.quote(raw_subject)
            body_encoded = urllib.parse.quote(raw_body)
            
            # The Mailto Link
            mailto_link = f"mailto:{target_email}?subject={subject_encoded}&body={body_encoded}"

            # 4. Action Buttons
            st.markdown("---")
            col1, col2 = st.columns([1, 2])
            
            with col1:
                # The Magic Button
                st.link_button(f"📧 Open Draft in Outlook", mailto_link)
                    
            with col2:
                if target_email:
                    st.caption(f"✅ Auto-detected email: **{target_email}**")
                else:
                    st.warning("⚠️ No specific email found. Recipient will be blank.")
                st.caption("ℹ️ *Clicking this opens your default email app (Outlook/Mail).*")
                
        except Exception as e:
            # Error Shield
            st.error(f"⚠️ An error occurred during processing.")
            st.warning(str(e))