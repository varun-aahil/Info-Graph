import sys
import threading
import time
import os
import uvicorn
import webview
from dotenv import load_dotenv, dotenv_values
import httpx

DESKTOP_PORT = 8000

def get_base_path():
    """Get the absolute path to the base directory, handling PyInstaller's _MEIPASS."""
    if getattr(sys, 'frozen', False):
        return sys._MEIPASS
    return os.path.dirname(os.path.abspath(__file__))

# 1. Resolve .env paths
base_path = get_base_path()
# Check both root and backend/ folder just in case
bundled_envs = [
    os.path.join(base_path, 'backend', '.env'),
    os.path.join(base_path, '.env')
]
external_env = os.path.join(os.path.dirname(sys.executable), '.env')

# 2. Aggressively load environment variables
target_env = external_env if os.path.isfile(external_env) else None
if not target_env:
    for env in bundled_envs:
        if os.path.isfile(env):
            target_env = env
            break

if target_env:
    # Load into os.environ manually to ensure all libraries see them
    env_vars = dotenv_values(target_env)
    for key, value in env_vars.items():
        if value is not None:
            os.environ[key] = value
    load_dotenv(target_env)

# 3. Set runtime defaults
desktop_origin = f"http://localhost:{DESKTOP_PORT}"
os.environ["FRONTEND_URL"] = os.environ.get("FRONTEND_URL", desktop_origin)
os.environ["GOOGLE_REDIRECT_URI"] = f"{desktop_origin}/api/v1/auth/google/callback"

# 4. Import app ONLY after env vars are set
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
            <p>Could not initialize backend server.</p>
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
    webview.start(private_mode=False)
