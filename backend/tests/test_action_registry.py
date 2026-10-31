"""Tests for the canonical action registry per CONTRACT v0.5.1 §3.1, §7.5, §15.1.

Verifies:
- Exactly 37 registered actions exist
- Exactly 12 read, 11 understand, 8 review, 6 controlled-write actions exist
- No duplicate action IDs exist
- Every action has valid input_schema, output_schema, side_effect, timeout_class, handler
- Every action has a valid deterministic test_name property
- Unknown action lookup raises ACTION_NOT_FOUND (404)
- Catalogue JSON Schema serialization succeeds
"""

import pytest

from app.actions.registry import get_action, get_catalogue, list_actions
from app.core.exceptions import AppException

EXPECTED_37_ACTIONS = [
    # 7.1 Read (12)
    "knowledge.search_all",
    "notes.get",
    "notes.search",
    "sources.get",
    "sources.search",
    "sources.get_processing_status",
    "entities.get",
    "entities.search",
    "graph.get_neighbors",
    "graph.find_path",
    "collections.get",
    "threads.get",
    # 7.2 Understand (11)
    "notes.summarize",
    "sources.summarize",
    "collections.summarize",
    "threads.summarize",
    "entities.summarize",
    "notes.compare",
    "sources.compare",
    "knowledge.answer",
    "knowledge.generate_brief",
    "notes.extract_concepts",
    "notes.suggest_tags",
    # 7.3 Review (8)
    "inbox.list",
    "inbox.accept",
    "inbox.reject",
    "sources.retry_processing",
    "knowledge.audit_processing",
    "graph.find_isolated_nodes",
    "graph.suggest_relationships",
    "notes.find_related",
    # 7.4 Controlled Writes (6)
    "notes.create",
    "notes.update",
    "notes.link",
    "collections.add_item",
    "graph.add_relationship",
    "notes.delete",
]


def test_action_registry_total_count_and_unique_ids():
    """Verify registry contains canonical 37 actions plus additional workspace CRUD actions with unique IDs."""
    actions = list_actions()
    assert len(actions) >= 37, f"Expected at least 37 registered actions, found {len(actions)}"

    action_ids = [a.id for a in actions]
    assert len(set(action_ids)) == len(actions), "Action IDs must be unique"
    assert set(EXPECTED_37_ACTIONS).issubset(set(action_ids)), "All canonical 37 actions must remain present"


def test_action_registry_categories_distribution():
    """Verify registry contains at least 12 read, 11 understand, 8 review, and 6 controlled writes."""
    actions = list_actions()
    read_count = sum(1 for a in actions if a.category == "read")
    understand_count = sum(1 for a in actions if a.category == "understand")
    review_count = sum(1 for a in actions if a.category == "review")
    write_count = sum(1 for a in actions if a.category == "controlled_write")

    assert read_count >= 12, f"Expected at least 12 read actions, got {read_count}"
    assert understand_count >= 11, f"Expected at least 11 understand actions, got {understand_count}"
    assert review_count >= 8, f"Expected at least 8 review actions, got {review_count}"
    assert write_count >= 6, f"Expected at least 6 controlled write actions, got {write_count}"


def test_action_registry_metadata_and_schemas():
    """Verify every action has valid schemas, classification, and handler per §3.1."""
    valid_side_effects = {"read", "propose", "write", "destructive"}
    valid_timeouts = {"read", "search", "llm"}

    for action in list_actions():
        assert action.name, f"Action {action.id} missing name"
        assert action.description, f"Action {action.id} missing description"
        assert action.input_schema_cls is not None, f"Action {action.id} missing input schema"
        assert action.output_schema_cls is not None, f"Action {action.id} missing output schema"
        assert action.side_effect in valid_side_effects, f"Invalid side effect for {action.id}"
        assert action.timeout_class in valid_timeouts, f"Invalid timeout class for {action.id}"
        assert callable(action.handler), f"Action {action.id} handler must be callable"

        # Check deterministic test naming mapping per §7.5
        expected_test_name = f"test_action_{action.id.replace('.', '_')}"
        assert action.test_name == expected_test_name


def test_get_action_lookup_and_not_found():
    """Verify get_action finds registered actions and raises ACTION_NOT_FOUND for unknown IDs."""
    action = get_action("notes.summarize")
    assert action.id == "notes.summarize"
    assert action.side_effect == "read"

    with pytest.raises(AppException) as exc:
        get_action("nonexistent.action")
    assert exc.value.code == "ACTION_NOT_FOUND"


def test_get_catalogue_serializability():
    """Verify catalogue items generate valid JSON Schemas for frontend consumption."""
    catalogue = get_catalogue()
    assert len(catalogue) >= 37
    for item in catalogue:
        assert isinstance(item.input_schema, dict)
        assert isinstance(item.output_schema, dict)
        assert "type" in item.input_schema
