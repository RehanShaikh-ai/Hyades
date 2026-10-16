"""Tests for FreeLLMAPI Runtime Discovery, Health Checking, and Management."""

from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
import httpx
import pytest

from app.services import runtime_service


def test_runtime_status_not_installed(client: TestClient):
    with patch("app.services.runtime_service.check_freellmapi_health") as mock_health:
        mock_health.return_value = {
            "status": "Not Installed",
            "is_running": False,
            "is_usable": False,
            "installed": False,
            "endpoint": "http://localhost:3001",
        }
        res = client.get("/api/v1/runtime/freellmapi/status")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "Not Installed"
        assert not data["is_running"]


def test_runtime_status_stopped(client: TestClient):
    with patch("app.services.runtime_service.check_freellmapi_health") as mock_health:
        mock_health.return_value = {
            "status": "Stopped",
            "is_running": False,
            "is_usable": False,
            "installed": True,
            "version": "0.2.1",
            "install_path": "/freellmapi",
            "endpoint": "http://localhost:3001",
        }
        res = client.get("/api/v1/runtime/freellmapi/status")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "Stopped"
        assert data["version"] == "0.2.1"


def test_runtime_status_running(client: TestClient):
    with patch("app.services.runtime_service.check_freellmapi_health") as mock_health:
        mock_health.return_value = {
            "status": "Running",
            "is_running": True,
            "is_usable": True,
            "endpoint": "http://localhost:3001",
            "latency_ms": 12.4,
            "models_count": 5,
            "requires_credentials": False,
        }
        res = client.get("/api/v1/runtime/freellmapi/status")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "Running"
        assert data["is_running"] is True
        assert data["models_count"] == 5


def test_runtime_test_connection_endpoint(client: TestClient):
    with patch("app.services.runtime_service.check_freellmapi_health") as mock_health:
        mock_health.return_value = {
            "status": "Running",
            "is_running": True,
            "is_usable": True,
            "endpoint": "http://custom-host:3001",
            "latency_ms": 8.5,
        }
        res = client.post(
            "/api/v1/runtime/freellmapi/test",
            json={"endpoint": "http://custom-host:3001", "api_key": "test_key"},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "Running"
        assert data["latency_ms"] == 8.5


def test_runtime_start_and_stop_service(client: TestClient):
    with patch("app.services.runtime_service.start_freellmapi_service") as mock_start, \
         patch("app.services.runtime_service.stop_freellmapi_service") as mock_stop:
        mock_start.return_value = {
            "success": True,
            "message": "FreeLLMAPI started successfully.",
            "status": "Running",
            "pid": 1234,
            "endpoint": "http://localhost:3001",
        }
        mock_stop.return_value = {
            "success": True,
            "message": "Managed FreeLLMAPI process stopped.",
        }

        res_start = client.post("/api/v1/runtime/freellmapi/start")
        assert res_start.status_code == 200
        assert res_start.json()["success"] is True
        assert res_start.json()["pid"] == 1234

        res_stop = client.post("/api/v1/runtime/freellmapi/stop")
        assert res_stop.status_code == 200
        assert res_stop.json()["success"] is True