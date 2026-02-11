# --- FILE: app.py ---
import sys
import os
import re
import urllib.parse

# --- PATH PATCH (The Fix) ---
# This forces Python to look in the current folder for backend.py
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import streamlit as st
# Now this import will work because we forced the path above
from backend import analyze_company 
from personas import SALES_PERSONAS

# 1. Page Config
st.set_page_config(page_title="Thales Sales Agent", page_icon="🤖", layout="wide")

# 2. Sidebar: Persona Selector
st.sidebar.title("👤 Identity")
# Create a list of names for the dropdown
persona_names = [p["name"] for p in SALES_PERSONAS.values()]
selected_user_name = st.sidebar.selectbox("Who are you?", persona_names)

st.sidebar.info(f"Drafting emails as: **{selected_user_name}**")

# 3. Main Content
st.title("🤖 Thales Sales Automation Agent")
st.markdown("### 🎯 Lead Enrichment & Outreach Generator (v3.0)")

# Input Area
with st.form("analysis_form"):
    company_name = st.text_input("Enter Target Company Name:", placeholder="e.g. Siemens Energy")
    submitted = st.form_submit_button("🚀 Launch Analysis")

# 4. Execution Logic
if submitted and company_name:
    # visual feedback while processing
    with st.spinner(f"🔍 Researching {company_name}, checking 'Perfect Customer Profile', and drafting email..."):
        
        # Call the backend "Master Plan" function
        # We pass the company name and the selected user's name
        try:
            result = analyze_company(company_name, selected_user_name)
            
            # Display Result
            st.success("Analysis Complete!")
            st.markdown("---")
            st.markdown(result)
            
            # --- NEW AUTOMATION LOGIC STARTS HERE ---
            
            # 1. Extract Email Address (Regex)
            # Looks for a pattern like "name@domain.com" in the AI's output
            email_match = re.search(r'[\w.+-]+@[\w-]+\.[\w.-]+', result)
            target_email = email_match.group(0) if email_match else ""
            
            # 2. Prepare the Mailto Link
            # We encode the subject and body so they work inside a URL
            subject = f"Question regarding Software Monetization at {company_name}"
            
            # NOTE: We are putting the *entire* AI output into the email body.
            # You will need to delete the "Research" part in Outlook before sending.
            body_encoded = urllib.parse.quote(result) 
            subject_encoded = urllib.parse.quote(subject)
            
            mailto_link = f"mailto:{target_email}?subject={subject_encoded}&body={body_encoded}"

            # 3. Action Buttons
            st.markdown("---")
            col1, col2 = st.columns([1, 2])
            
            with col1:
                # The "One-Click Send" Button
                if target_email:
                    st.link_button(f"📧 Open Draft for {target_email}", mailto_link)
                else:
                    st.link_button("📧 Open Blank Draft", f"mailto:?subject={subject_encoded}&body={body_encoded}")
                    
            with col2:
                if target_email:
                    st.caption(f"✅ Auto-detected email: **{target_email}**")
                else:
                    st.warning("⚠️ No specific email address found in the analysis. You will need to add the recipient manually.")
                
        except Exception as e:
            st.error(f"An error occurred: {e}")