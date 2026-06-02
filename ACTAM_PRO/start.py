import subprocess
import webbrowser
import os
import sys

def run_project():
    print("🚀 Starting ACTAM Pro Audio Server...")
    
    # 1. Open the UI immediately (it will show the loading animation)
    html_path = f"file://{os.path.abspath('index.html')}"
    print(f"🌐 Opening loading interface at: {html_path}")
    webbrowser.open(html_path)
    
    # 2. Start the server in the background
    print("⏳ Please wait while instruments are generated (this may take a moment)...")
    server_process = subprocess.Popen([sys.executable, "main.py"])
    
    # 3. Keep this script alive until you press Ctrl+C
    try:
        print("\n✅ Engine generation started. Press Ctrl+C in this terminal to shut down.")
        server_process.wait()
    except KeyboardInterrupt:
        print("\n🛑 Shutting down ACTAM Pro Server...")
        server_process.terminate()

if __name__ == '__main__':
    run_project()