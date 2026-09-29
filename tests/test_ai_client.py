from types import SimpleNamespace

import anthropic
import httpx
import pytest

from paperboard.ai_client import DEFINER_MODEL, READER_MODEL, AiError, AnthropicClaude

REQUEST = httpx.Request("POST", "https://api.anthropic.com/v1/messages")


def _status(cls, code):
    return cls("boom", response=httpx.Response(code, request=REQUEST), body=None)


class _Stream:
    def __init__(self, message, deltas=()):
        self.message, self.text_stream = message, iter(deltas)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def get_final_message(self):
        return self.message


class _Sdk:
    def __init__(self, message=None, deltas=(), raises=None):
        self.kwargs = None
        self.messages = SimpleNamespace(stream=self._stream)
        self._message, self._deltas, self._raises = message, deltas, raises

    def _stream(self, **kwargs):
        self.kwargs = kwargs
        if self._raises:
            raise self._raises
        return _Stream(self._message, self._deltas)


def _message(text, stop="end_turn"):
    return SimpleNamespace(stop_reason=stop, content=[SimpleNamespace(type="text", text=text)])


def test_read_paper_sends_opus_high_effort_and_the_schema_and_parses_json():
    sdk = _Sdk(_message('{"terms": [], "where_to_look": []}'))
    read = AnthropicClaude(sdk).read_paper("sys", "paper", {"type": "object"})
    assert read.answer == {"terms": [], "where_to_look": []}
    assert read.raw == '{"terms": [], "where_to_look": []}'
    assert sdk.kwargs["model"] == READER_MODEL == "claude-opus-5-5"
    assert sdk.kwargs["max_tokens"] == 64000
    assert sdk.kwargs["output_config"]["effort"] == "high"
    assert sdk.kwargs["output_config"]["format"]["schema"] == {"type": "object"}
    assert "output_format" not in sdk.kwargs


@pytest.mark.parametrize("stop, code", [("refusal", "refused"), ("max_tokens", "too_long")])
def test_a_refusal_or_a_cut_off_answer_is_an_error_before_parsing(stop, code):
    with pytest.raises(AiError) as err:
        AnthropicClaude(_Sdk(_message("{", stop))).read_paper("s", "p", {})
    assert err.value.code == code


def test_output_that_is_not_json_is_invalid():
    with pytest.raises(AiError) as err:
        AnthropicClaude(_Sdk(_message("not json"))).read_paper("s", "p", {})
    assert err.value.code == "invalid_output"


@pytest.mark.parametrize("exc, code", [
    (_status(anthropic.AuthenticationError, 401), "no_key"),
    (_status(anthropic.RateLimitError, 429), "rate_limited"),
    (_status(anthropic.InternalServerError, 500), "api_error"),
    (anthropic.APIConnectionError(request=REQUEST), "network"),
])
def test_sdk_errors_become_one_plain_ai_error(exc, code):
    with pytest.raises(AiError) as err:
        AnthropicClaude(_Sdk(raises=exc)).read_paper("s", "p", {})
    assert err.value.code == code and str(err.value)


def test_no_credentials_at_all_is_no_key():
    with pytest.raises(AiError) as err:
        AnthropicClaude(_Sdk(raises=TypeError("Could not resolve authentication method"))).read_paper("s", "p", {})
    assert err.value.code == "no_key"


def test_an_unrelated_type_error_is_not_hidden():
    with pytest.raises(TypeError):
        AnthropicClaude(_Sdk(raises=TypeError("bad argument"))).read_paper("s", "p", {})


def test_define_streams_sonnet_low_effort_deltas():
    sdk = _Sdk(_message('{"explanation": "x", "grounds": []}'), deltas=['{"expl', 'anation": "x", "grounds": []}'])
    assert "".join(AnthropicClaude(sdk).define("s", "p", {})) == '{"explanation": "x", "grounds": []}'
    assert sdk.kwargs["model"] == DEFINER_MODEL == "claude-sonnet-5"
    assert sdk.kwargs["output_config"]["effort"] == "low"


def test_define_raises_a_refusal_after_the_stream():
    sdk = _Sdk(_message("", "refusal"), deltas=[])
    with pytest.raises(AiError):
        list(AnthropicClaude(sdk).define("s", "p", {}))
