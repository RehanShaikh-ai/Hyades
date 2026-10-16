# -*- coding: utf-8 -*-
"""Tests for assistant stream failure handling and ghost message prevention."""

import json
import uuid
from unittest.mock import MagicMock, patch
import pytest

from app.core.exceptions import LLMProviderUnavailableError
from app.models.conversation import Conversation
from app.models.message import Message
from app.models.workspace import Workspace
from app.models.user import User
from app.services import assistant_service


def test_stream_assistant_failure_emits_sse_and_no_ghost_message(db_session):
    """When stream fails before any tokens are produced, it must yield an error event and NOT save a ghost assistant message."""
    user = User(id=uuid.uuid4(), display_name="Test User")
    db_session.add(user)
    db_session.commit()

    ws = Workspace(id=uuid.uuid4(), name="Test WS", owner_id=user.id)
    db_session.add(ws)
    db_session.commit()

    conv = Conversation(
        id=uuid.uuid4(),
        workspace_id=ws.id,
        title="Error Test Conv",
    )
    db_session.add(conv)
    db_session.commit()

    mock_provider = MagicMock()
    mock_provider.provider_name.return_value = "freellmapi"
    mock_provider.model_name.return_value = "gemini-flash-lite"
    mock_provider.generate_stream.side_effect = LLMProviderUnavailableError(
        "FreeLLMAPI authentication failed (401 Unauthorized): invalid or missing unified API key."
    )

    with patch("app.services.llm_service.get_llm_provider", return_value=mock_provider):
        events = list(
            assistant_service.stream_assistant_response(
                db=db_session,
                conversation_id=conv.id,
                content="Hello there",
            )
        )

    # Verify user message was created, but NO assistant message
    messages = db_session.query(Message).filter_by(conversation_id=conv.id).all()
    assert len(messages) == 1
    assert messages[0].role == "user"

    # Verify SSE error event was emitted
    error_events = [e for e in events if '"type": "error"' in e]
    assert len(error_events) >= 1
    err_data = json.loads(error_events[0].replace("data: ", "").strip())
    assert err_data["code"] == "LLM_PROVIDER_UNAVAILABLE"
    assert "401 Unauthorized" in err_data["message"]
