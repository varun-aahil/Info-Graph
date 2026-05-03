import sys
import threading
import time
import os
import uvicorn
import webview
from dotenv import load_dotenv
import httpx

DESKTOP_PORT = 8000

# We must load .env BEFORE anything else, so that SQLAlchemy and other imports
# use the correct Supabase database URL.
def get_base_path():
    """Get the absolute path to the base directory, handling PyInstaller's _MEIPASS."""
    if getattr(sys, 'frozen', False):
        return sys._MEIPASS
    return os.path.dirname(os.path.abspath(__file__))

base_path = get_base_path()
env_path = os.path.join(base_path, '.env')

# If running as .exe, look for an external .env in the same directory as the .exe
if getattr(sys, 'frozen', False):
    external_env = os.path.join(os.path.dirname(sys.executable), '.env')
    if os.path.isfile(external_env):
        load_dotenv(external_env)
    else:
        load_dotenv(env_path) # Fallback to bundled .env
else:
    load_dotenv(env_path)

desktop_origin = f"http://localhost:{DESKTOP_PORT}"
os.environ["FRONTEND_URL"] = desktop_origin
os.environ["GOOGLE_REDIRECT_URI"] = f"{desktop_origin}/api/v1/auth/google/callback"

# Important: Import FastAPI app AFTER loading the environment variables
from backend.app.main import app

def start_server(port):
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")


def wait_for_server(port, timeout=30.0):
    deadline = time.time() + timeout
    last_error = None
    health_url = f"http://127.0.0.1:{port}/health"
    while time.time() < deadline:
        try:
            response = httpx.get(health_url, timeout=1.5)
            if response.is_success:
                return
        except Exception as exc:
            last_error = exc
        time.sleep(0.25)
    raise RuntimeError(f"Backend did not become ready at {health_url}. Last error: {last_error}")

if __name__ == "__main__":
    port = DESKTOP_PORT
    server_thread = threading.Thread(target=start_server, args=(port,), daemon=True)
    server_thread.start()

    try:
        wait_for_server(port)
        app_url = f"http://localhost:{port}"
    except Exception as exc:
        error_html = f"""
        <html>
          <body style="font-family: Segoe UI, sans-serif; background:#111; color:#f5f5f5; padding:24px;">
            <h2>InfoGraph Desktop failed to start</h2>
            <p>Port {port} must be available because desktop Google login redirects back to this fixed local address.</p>
            <pre style="white-space: pre-wrap; background:#1b1b1b; padding:16px; border-radius:8px;">{exc}</pre>
          </body>
        </html>
        """
        app_url = None

    window_kwargs = {
        "title": "InfoGraph Desktop",
        "width": 1400,
        "height": 900,
        "min_size": (1024, 768),
        "background_color": "#FFFFFF",
    }
    if app_url is not None:
        webview.create_window(url=app_url, **window_kwargs)
    else:
        webview.create_window(html=error_html, **window_kwargs)
    webview.start(private_mode=False) # private_mode=False keeps localStorage for tokens
