import pytest

from backend.app.core.dataset import DatasetError, apply_changes, load_dataset
from backend.tests.engine.conftest import DATA


def test_counts():
    ds = load_dataset(DATA)
    assert (len(ds.rooms), len(ds.faculty), len(ds.groups), len(ds.sessions), len(ds.requests), len(ds.exams)) == (27, 40, 14, 189, 25, 41)
    assert ds.cancelled == {"BR-04"}


def test_apply_sample_disruption(sample_disruption):
    ds = apply_changes(load_dataset(DATA), sample_disruption)
    assert ("MON", 1) in ds.fac_un["F07"] and ("TUE", 3) in ds.room_un["CR-102"]
    assert "CS202-T2" in ds.sessions and len(ds.sessions) == 190


def test_apply_changes_does_not_mutate_original(sample_disruption):
    ds = load_dataset(DATA)
    apply_changes(ds, sample_disruption)
    assert "CS202-T2" not in ds.sessions and ("MON", 1) not in ds.fac_un["F07"]


def test_apply_changes_rejects_unknown_type():
    with pytest.raises(DatasetError):
        apply_changes(load_dataset(DATA), {"changes": [{"type": "teleport"}]})


def test_apply_changes_rejects_unknown_ids():
    ds = load_dataset(DATA)
    with pytest.raises(DatasetError):
        apply_changes(ds, {"changes": [{"type": "faculty_unavailable", "faculty_id": "F999", "days": ["MON"], "periods": [1]}]})
    with pytest.raises(DatasetError):
        apply_changes(ds, {"changes": [{"type": "room_unavailable", "room_id": "NOPE", "days": ["MON"], "periods": [1]}]})
    with pytest.raises(DatasetError):
        apply_changes(ds, {"changes": [{"type": "remove_session", "session_id": "NOPE"}]})


def test_load_rejects_missing_keys(raw):
    bad = {k: v for k, v in raw.items() if k != "sessions"}
    with pytest.raises(DatasetError):
        load_dataset(bad)
