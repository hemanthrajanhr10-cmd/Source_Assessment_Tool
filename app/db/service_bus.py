"""
Azure Service Bus integration.

Jobs queue  (sat-jobs):    backend → agent   — assessment job payload
Results queue (sat-results): agent → backend — completed assessment results

The backend publishes jobs and listens for results in a background thread.
The agent connects to Service Bus (outbound port 443) — works through VPNs.
"""

import json
import threading
from datetime import datetime, timezone
from typing import Any, Callable, Optional

from app.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

_sb_available = False
_ServiceBusClient = None

try:
    from azure.servicebus import ServiceBusClient, ServiceBusMessage
    _sb_available = True
    _ServiceBusClient = ServiceBusClient
except ImportError:
    logger.warning("azure-servicebus not installed — Service Bus features disabled")


def is_available() -> bool:
    """Returns True if Service Bus is configured and the SDK is installed."""
    conn_str = settings.service_bus_connection_string.get_secret_value()
    return _sb_available and bool(conn_str)


def _get_client():
    conn_str = settings.service_bus_connection_string.get_secret_value()
    return _ServiceBusClient.from_connection_string(conn_str)


# ── Publisher — backend sends job to agent ────────────────────────────────────

def publish_job(job_id: str, payload: dict) -> None:
    """
    Publish an assessment job to the sat-jobs queue.
    The agent will pick this up, run the assessment, post results to sat-results.
    """
    if not is_available():
        raise RuntimeError("Service Bus is not configured. Set SERVICE_BUS_CONNECTION_STRING.")

    message_body = json.dumps({
        "job_id": job_id,
        "payload": payload,
        "queued_at": datetime.now(timezone.utc).isoformat(),
    })

    with _get_client() as client:
        with client.get_queue_sender(settings.service_bus_jobs_queue) as sender:
            msg = ServiceBusMessage(
                message_body,
                subject=f"assessment-job:{job_id}",
                message_id=job_id,
            )
            sender.send_messages(msg)

    logger.info("Job %s published to Service Bus queue '%s'", job_id, settings.service_bus_jobs_queue)


# ── Result listener — backend receives results from agent ─────────────────────

def start_result_listener(on_result: Callable[[str, dict], None]) -> threading.Thread:
    """
    Start a background thread that continuously reads from sat-results queue.
    Calls on_result(job_id, result_payload) for each completed assessment.
    """
    if not is_available():
        logger.warning("Service Bus not configured — result listener not started")
        return None

    def _listen():
        logger.info("Service Bus result listener started (queue: %s)", settings.service_bus_results_queue)
        while True:
            try:
                with _get_client() as client:
                    with client.get_queue_receiver(
                        settings.service_bus_results_queue,
                        max_wait_time=30,
                    ) as receiver:
                        for msg in receiver:
                            try:
                                body = json.loads(str(msg))
                                job_id = body.get("job_id")
                                if not job_id:
                                    receiver.complete_message(msg)
                                    continue

                                logger.info("Result received for job %s", job_id)
                                on_result(job_id, body)
                                receiver.complete_message(msg)

                            except Exception as exc:
                                logger.error("Failed to process result message: %s", exc)
                                receiver.abandon_message(msg)

            except Exception as exc:
                logger.error("Result listener error (will retry in 10s): %s", exc)
                import time
                time.sleep(10)

    t = threading.Thread(target=_listen, name="sb-result-listener", daemon=True)
    t.start()
    return t


# ── Agent-side helpers (used by agent.py) ─────────────────────────────────────

def agent_receive_job(connection_string: str, jobs_queue: str, wait_seconds: int = 30) -> Optional[dict]:
    """
    Called by the agent — blocks up to wait_seconds for a job.
    Returns the job dict or None if no job arrived.
    """
    from azure.servicebus import ServiceBusClient as SBC
    with SBC.from_connection_string(connection_string) as client:
        with client.get_queue_receiver(jobs_queue, max_wait_time=wait_seconds) as receiver:
            msgs = receiver.receive_messages(max_message_count=1, max_wait_time=wait_seconds)
            if not msgs:
                return None
            msg = msgs[0]
            body = json.loads(str(msg))
            receiver.complete_message(msg)
            return body


def agent_send_result(connection_string: str, results_queue: str, job_id: str,
                      results: Optional[dict], error: Optional[str]) -> None:
    """
    Called by the agent — sends completed assessment results (or error) back.
    """
    from azure.servicebus import ServiceBusClient as SBC, ServiceBusMessage as SBMsg
    payload = json.dumps({
        "job_id": job_id,
        "results": results,
        "error": error,
        "completed_at": datetime.now(timezone.utc).isoformat(),
    })
    with SBC.from_connection_string(connection_string) as client:
        with client.get_queue_sender(results_queue) as sender:
            sender.send_messages(SBMsg(payload, message_id=job_id))
