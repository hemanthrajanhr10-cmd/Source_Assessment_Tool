import threading
from typing import Optional

from app.models.job import JobRecord

_store: dict[str, JobRecord] = {}
_lock = threading.Lock()


def create_job(record: JobRecord) -> None:
    with _lock:
        _store[record.job_id] = record


def get_job(job_id: str) -> Optional[JobRecord]:
    with _lock:
        return _store.get(job_id)


def update_job(job_id: str, **kwargs) -> None:
    with _lock:
        record = _store.get(job_id)
        if record is None:
            return
        for key, value in kwargs.items():
            if hasattr(record, key):
                setattr(record, key, value)


def list_jobs() -> list[JobRecord]:
    with _lock:
        return list(_store.values())
