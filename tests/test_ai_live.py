"""The one test that calls Claude. Skipped unless PAPERBOARD_LIVE_AI=1 (and a key or profile is set up)."""

import json
import os

import pytest

from paperboard.ai_client import AnthropicClaude
from paperboard.ai_model import DEFINE_SCHEMA

pytestmark = pytest.mark.skipif(os.environ.get("PAPERBOARD_LIVE_AI") != "1", reason="set PAPERBOARD_LIVE_AI=1 to call Claude")


def test_a_live_quick_definition_is_schema_shaped():
    prompt = '<span id="p1-r1">We call this Batch Normalization, which normalises layer inputs.</span>\nWord: Batch Normalization'
    text = "".join(AnthropicClaude().define("Define the word from the given text only.", prompt, DEFINE_SCHEMA))
    answer = json.loads(text)
    assert answer["explanation"] and isinstance(answer["grounds"], list)
