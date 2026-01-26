import streamlit as st
import google.generativeai as genai
import pandas as pd

# 1. SaaS Config (The Title bar)
st.set_page_config(page_title="Thales Agent Architect", layout="wide")

# 2. The Sidebar (User Controls)
with st.sidebar:
    st.header("⚙️ Agent Settings")
    api_key = st.text_input("Enter Google API Key", type="password")
    st.info("This agent uses the 'Human-in-the-Loop' architecture.")

# 3. Main Dashboard
st.title("🛡️ Thales Software Monetization Agent")
st.markdown("### Lead Enrichment & Outreach Automation")

# 4. The "Phase 1" Input Area
company_name = st.text_input("Enter Company Name to Analyze:", placeholder="e.g. Siemens Healthineers")

# 5. The "Brain" (Placeholder Logic)
if st.button("🚀 Start Phase 1 Analysis"):
    if not api_key:
        st.error("Please enter your API Key in the sidebar first!")
    else:
        st.success(f"Agent is now researching: **{company_name}**...")
        
        # This is where we will hook up Gemini later
        st.write("Generating initial value hypothesis...")
        
        # visual placeholder for the data table
        dummy_data = {
            "Company": [company_name],
            "Industry": ["MedTech (Placeholder)"],
            "Revenue Model": ["Hardware-heavy"],
            "Proposed Sentinel Product": ["Sentinel RMS (Cloud-connected)"]
        }
        st.table(pd.DataFrame(dummy_data))