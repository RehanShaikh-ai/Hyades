"""FreeLLMAPI Local Runtime Manager and Discovery Service.

Detects availability, checks service health, manages guided setup, and handles opt-in process control.
"""

import json
import logging
import os
import subprocess
import time
from pathlib import Path
from typing import Any

import httpx

from app.core.config import settings
from app.services.llm_service import _auto_discover_freellmapi_key

logger = logging.getLogger("app.services.runtime_service")

# Global in-memory handle for Hyades-spawned FreeLLMAPI process
_MANAGED_PROCESS: subprocess.Popen | None = None
_MANAGED_PID: int | None = None


def get_freellmapi_paths() -> list[Path]:
    """Candidate paths where FreeLLMAPI might be installed locally."""
    candidates = []
    env_path = os.getenv("FREELLMAPI_PATH")
    if env_path:
        candidates.append(Path(env_path))

    # Common relative locations in dev environments
    candidates.extend(
        [
            Path("/freellmapi"),
            Path("/app/freellmapi"),
            Path("../freellmapi"),
            Path(r"C:\Users\rehan\OneDrive\Desktop\Personal\freellmapi"),
        ]
    )
    return candidates


def detect_installed_version() -> tuple[bool, str | None, str | None]:
    """Detect if FreeLLMAPI repository or package is present on the filesystem."""
    for path in get_freellmapi_paths():
        try:
            pkg_file = path / "package.json"
            server_pkg_file = path / "server" / "package.json"
            if server_pkg_file.exists():
                with open(server_pkg_file, encoding="utf-8") as f:
                    data = json.load(f)
                    return True, data.get("version", "0.2.1"), str(path)
            elif pkg_file.exists():
                with open(pkg_file, encoding="utf-8") as f:
                    data = json.load(f)
                    if "freellmapi" in data.get("name", "").lower():
                        return True, data.get("version", "0.2.1"), str(path)
        except Exception:
            continue
    return False, None, None


def check_freellmapi_health(
    base_url: str | None = None,
    api_key: str | None = None,
    timeout_seconds: float = 2.0,
) -> dict[str, Any]:
    """Perform real health check against FreeLLMAPI service."""
    url = (base_url or settings.FREELLMAPI_BASE_URL or "http://localhost:3001").rstrip("/")
    probe_urls = [url]
    if "localhost" in url:
        probe_urls.append(url.replace("localhost", "host.docker.internal"))

    start_time = time.time()
    for target in probe_urls:
        try:
            with httpx.Client(timeout=timeout_seconds) as client:
                ping_res = client.get(f"{target}/api/ping")
                latency_ms = round((time.time() - start_time) * 1000, 1)

                if ping_res.status_code == 200:
                    headers = {}
                    key = api_key or settings.FREELLMAPI_API_KEY
                    if not key:
                        key = _auto_discover_freellmapi_key()
                    if key:
                        headers["Authorization"] = f"Bearer {key}"

                    models_count = 0
                    config_required = False
                    try:
                        models_res = client.get(f"{target}/v1/models", headers=headers)
                        if models_res.status_code == 200:
                            data = models_res.json()
                            models_count = len(data.get("data", []))
                        elif models_res.status_code in (401, 403):
                            config_required = True
                    except Exception:
                        pass

                    return {
                        "status": "Configuration Required" if config_required else "Running",
                        "is_running": True,
                        "is_usable": True,
                        "endpoint": target,
                        "latency_ms": latency_ms,
                        "models_count": models_count,
                        "requires_credentials": config_required or not bool(key),
                        "has_api_key": bool(key),
                    }
        except (httpx.ConnectError, httpx.TimeoutException):
            continue
        except Exception as e:
            return {
                "status": "Error",
                "is_running": False,
                "is_usable": False,
                "endpoint": target,
                "error": str(e),
            }

    installed, version, install_path = detect_installed_version()
    if installed:
        return {
            "status": "Stopped",
            "is_running": False,
            "is_usable": False,
            "installed": True,
            "version": version,
            "install_path": install_path,
            "endpoint": url,
        }

    return {
        "status": "Not Installed",
        "is_running": False,
        "is_usable": False,
        "installed": False,
        "endpoint": url,
    }


def start_freellmapi_service() -> dict[str, Any]:
    """Safely start local FreeLLMAPI process if installed and not already running."""
    global _MANAGED_PROCESS, _MANAGED_PID

    health = check_freellmapi_health(timeout_seconds=1.0)
    if health.get("is_running"):
        return {
            "success": True,
            "message": "FreeLLMAPI service is already running.",
            "status": health["status"],
            "endpoint": health.get("endpoint"),
        }

    installed, version, install_path = detect_installed_version()
    if not installed or not install_path:
        return {
            "success": False,
            "message": "FreeLLMAPI is not installed on this machine. Follow the setup guide to install.",
            "status": "Not Installed",
        }

    try:
        proc = subprocess.Popen(
            ["npm", "run", "dev", "-w", "server"],
            cwd=install_path,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            shell=True,
        )
        _MANAGED_PROCESS = proc
        _MANAGED_PID = proc.pid

        for _ in range(6):
            time.sleep(0.5)
            h = check_freellmapi_health(timeout_seconds=0.5)
            if h.get("is_running"):
                return {
                    "success": True,
                    "message": "FreeLLMAPI started successfully.",
                    "status": "Running",
                    "pid": proc.pid,
                    "endpoint": h.get("endpoint"),
                }

        return {
            "success": True,
            "message": "FreeLLMAPI process initiated. It is initializing in the background.",
            "status": "Starting",
            "pid": proc.pid,
        }
    except Exception as e:
        return {
            "success": False,
            "message": f"Failed starting FreeLLMAPI process: {str(e)}",
            "status": "Error",
        }


def stop_freellmapi_service() -> dict[str, Any]:
    """Stop the managed FreeLLMAPI process started by Hyades."""
    global _MANAGED_PROCESS, _MANAGED_PID
    if _MANAGED_PROCESS is not None:
        try:
            _MANAGED_PROCESS.terminate()
            _MANAGED_PROCESS.wait(timeout=3.0)
        except Exception:
            try:
                _MANAGED_PROCESS.kill()
            except Exception:
                pass
        _MANAGED_PROCESS = None
        _MANAGED_PID = None
        return {"success": True, "message": "Managed FreeLLMAPI process stopped."}

    return {"success": False, "message": "No active process was initiated by Hyades."}
