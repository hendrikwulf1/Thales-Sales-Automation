from googlesearch import search

print("--- STARTING NETWORK TEST ---")
try:
    print("Attempting to reach Google...")
    # asking for just 1 result to be fast
    results = search("Thales Group", num_results=1, advanced=True)
    
    print("✅ Connection Successful! Found:")
    for result in results:
        print(f"   Title: {result.title}")
        print(f"   URL: {result.url}")
        
except Exception as e:
    print(f"❌ CONNECTION FAILED: {e}")
    print("Tip: Codespaces might be blocking the request or the library is outdated.")
print("--- TEST FINISHED ---")