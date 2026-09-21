# ADR-003: Rate Limiting Approach

## Status
Superseded

Superseded by [ADR-006](006-open5e-api-migration.md). Open5e is a public JSON API, so the scraping-era rate limits no longer apply; in-process caching is the current throttle.

## Context
Web scraping dnd5e.wikidot.com requires responsible rate limiting to:
- Avoid overwhelming the wiki server
- Prevent IP blocking or service degradation
- Maintain good citizenship in the D&D community
- Ensure sustainable long-term access

The guide analysis recommends 2 requests per second as a conservative approach that balances performance with server respect.

## Decision
Implement a thread-safe, decorator-based rate limiting system with configurable limits:

### Rate Limiting Parameters
- **Default Rate**: 2 requests per second (500ms minimum interval)
- **Configurable**: Allow adjustment via environment variables
- **Burst Handling**: No burst allowance - strict interval enforcement
- **Scope**: Applied at the HTTP request level

### Implementation Approach
```python
class RateLimiter:
    def __init__(self, calls_per_second: float = 2.0):
        self.calls_per_second = calls_per_second
        self.last_call = 0
        self.lock = Lock()  # Thread-safe
    
    def __call__(self, func):
        def wrapper(*args, **kwargs):
            with self.lock:
                now = time.time()
                time_since_last = now - self.last_call
                min_interval = 1.0 / self.calls_per_second
                
                if time_since_last < min_interval:
                    time.sleep(min_interval - time_since_last)
                
                self.last_call = time.time()
                return func(*args, **kwargs)
        return wrapper
```

### Application Strategy
- Apply rate limiting to `_fetch_page()` method only
- Cache hits bypass rate limiting entirely
- Rate limiting persists across cache misses
- No rate limiting for local file operations

### Configuration
- Environment variable: `DND_RATE_LIMIT` (requests per second)
- Default fallback: 2.0 requests/second
- Minimum enforced: 0.5 requests/second (2-second intervals)
- Maximum recommended: 5.0 requests/second

## Alternatives Considered
1. **Token Bucket Algorithm**: More complex, allows bursts that could overwhelm server
2. **Sliding Window**: Complex implementation, minimal benefit for this use case  
3. **No Rate Limiting**: Unethical and risks IP blocking
4. **Fixed Delays**: Less efficient than minimum interval approach
5. **Adaptive Rate Limiting**: Too complex for single-source scraping

## Consequences

### Positive
- Ethical and sustainable scraping practices
- Reduced risk of IP blocking or service issues
- Predictable performance characteristics  
- Simple implementation and maintenance
- Thread-safe for concurrent usage

### Negative
- Slower initial data loading (mitigated by caching)
- Potential user frustration during cache misses
- Fixed overhead regardless of server capacity

### Performance Impact
- With 2 req/sec limit: Full spell database (~300 spells) would take ~2.5 minutes on first load
- With aggressive caching: Subsequent requests are instant
- Cold start penalty acceptable for long-running service

## Monitoring and Tuning
- Log rate limiting delays for performance analysis
- Monitor for HTTP 429 (Too Many Requests) responses
- Track cache hit ratios to minimize rate limiting impact
- Consider adaptive tuning based on server response patterns

## Risk Mitigation
- Implement exponential backoff on HTTP errors
- Add jitter to avoid synchronized request patterns
- Provide manual rate limit override for development
- Monitor for blocking patterns and adjust accordingly

## Future Enhancements
- Server-specific rate limiting (different limits for different domains)
- Time-of-day adaptive rates (slower during peak hours)
- Response time based adaptive rates
- Integration with HTTP retry strategies