"""The one test that runs the real `claude` CLI. Skipped unless PAPERBOARD_LIVE_CLAUDE_CODE=1 (and you are logged in)."""

import json
import os

import pytest

from paperboard.ai_model import DEFINE_SCHEMA
from paperboard.claude_code import ClaudeCodeClaude

pytestmark = pytest.mark.skipif(os.environ.get("PAPERBOARD_LIVE_CLAUDE_CODE") != "1",
                                reason="set PAPERBOARD_LIVE_CLAUDE_CODE=1 to run Claude Code")


def test_a_live_quick_definition_through_claude_code_is_schema_shaped():
    prompt = '<span id="p1-r1">We call this Batch Normalization, which normalises layer inputs.</span>\nWord: Batch Normalization'
    text = "".join(ClaudeCodeClaude().define("Define the word from the given text only.", prompt, DEFINE_SCHEMA))
    answer = json.loads(text)
    assert answer["explanation"] and isinstance(answer["grounds"], list)
