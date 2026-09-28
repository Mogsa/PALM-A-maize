import threading
from datetime import UTC, datetime, timedelta

from paperboard.ai_model import AiFile, Definition
from paperboard.store import Store


def _store(store_root):
    store = Store(store_root)
    return store, store.list_papers()[0].paper_id


def test_no_ai_json_reads_as_none(store_root):
    store, pid = _store(store_root)
    assert store.read_ai(pid) is None


def test_update_ai_writes_and_reads_back(store_root):
    store, pid = _store(store_root)
    at = store.read_source(pid).extracted_at
    store.update_ai(pid, lambda _: AiFile(extracted_at=at))
    assert store.read_ai(pid).extracted_at == at
    assert (store.paper_dir(pid) / "ai.json").is_file()


def test_ai_is_stale_when_source_is_newer(store_root):
    store, pid = _store(store_root)
    at = store.read_source(pid).extracted_at
    assert not store.ai_is_stale(pid, AiFile(extracted_at=at))
    assert store.ai_is_stale(pid, AiFile(extracted_at=at - timedelta(minutes=1)))


def test_update_ai_keeps_a_definition_written_meanwhile(store_root):
    """The pass and a quick definition both write ai.json; neither loses the other's."""
    store, pid = _store(store_root)
    at = datetime.now(UTC)
    inside, go_on = threading.Event(), threading.Event()

    def slow_pass(current):
        inside.set()
        go_on.wait(1)
        return (current or AiFile(extracted_at=at)).model_copy(update={"reader": None})

    worker = threading.Thread(target=store.update_ai, args=(pid, slow_pass))
    worker.start()
    inside.wait(1)
    add = Definition(model="m", explanation="e", grounds=[])
    releaser = threading.Timer(0.1, go_on.set)
    releaser.start()
    store.update_ai(pid, lambda cur: (cur or AiFile(extracted_at=at)).model_copy(
        update={"defined": {**(cur.defined if cur else {}), "bn": add}}))
    worker.join()
    assert "bn" in store.read_ai(pid).defined
