"""
Token-bucket rate limiter for Fabric REST API calls.

Designed for asyncio: acquire() is a coroutine that yields to the event loop
while waiting, so it never blocks other concurrent tasks.

Global instance `fabric_rate_limiter` caps throughput at 200 requests/minute —
the recommended ceiling for Fabric REST API to avoid 429 throttling.
"""

import asyncio
import time


class TokenBucketRateLimiter:
    """
    Async token-bucket rate limiter.

    Algorithm: tokens refill continuously at `tokens_per_minute / 60` per second.
    A burst up to `burst_capacity` is allowed (defaults to tokens_per_minute).

    Thread safety: uses asyncio.Lock — safe for concurrent coroutines on the
    same event loop. Not safe across OS threads (not needed here).
    """

    def __init__(self, tokens_per_minute: int = 200, burst_capacity: int | None = None):
        self._capacity: float = float(burst_capacity or tokens_per_minute)
        # Tokens added per second
        self._refill_rate: float = tokens_per_minute / 60.0
        self._tokens: float = self._capacity
        self._last_refill: float = time.monotonic()
        # Lock prevents two coroutines from simultaneously observing and
        # decrementing the token count (a classic check-then-act race).
        self._lock = asyncio.Lock()

    def _refill(self) -> None:
        """Add tokens proportional to elapsed time (must be called under lock)."""
        now = time.monotonic()
        elapsed = now - self._last_refill
        self._tokens = min(self._capacity, self._tokens + elapsed * self._refill_rate)
        self._last_refill = now

    async def acquire(self, tokens: int = 1) -> None:
        """
        Acquire `tokens` from the bucket.  Yields the event loop while waiting
        so other async tasks are not starved.
        """
        while True:
            async with self._lock:
                self._refill()
                if self._tokens >= tokens:
                    self._tokens -= tokens
                    return
                # How long until enough tokens accumulate
                wait_sec = (tokens - self._tokens) / self._refill_rate

            # Sleep outside the lock — small cap so we re-check frequently
            await asyncio.sleep(min(wait_sec, 0.5))


# Shared singleton used by the orchestrator.
# tokens_per_minute=200 matches the Fabric REST API sustained limit.
# burst_capacity=400 allows up to 200 items to start immediately without
# rate-limiting delay (each item consumes 2 tokens; 400/2 = 200 items).
# Actual 429s are still handled by retry logic in the HTTP helpers.
fabric_rate_limiter = TokenBucketRateLimiter(tokens_per_minute=200, burst_capacity=400)
