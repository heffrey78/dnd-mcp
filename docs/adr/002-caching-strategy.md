# ADR-002: Caching Strategy for D&D Content

## Status
Accepted. Still current: caching moved from scraped pages to Open5e responses, and `UnifiedSearchEngine` adds a second result-level cache on top of the client cache.

## Context
The D&D 5e wiki content is relatively static, making it ideal for aggressive caching. The guide analysis shows that content rarely changes, and implementing effective caching will:
- Reduce load on the wiki server
- Improve response times significantly  
- Provide offline capability during network issues
- Comply with ethical scraping practices

## Decision
We will implement a multi-layered caching strategy:

### In-Memory Caching
- Use Python's `@lru_cache` decorator for frequently accessed data
- Cache parsed data structures, not raw HTML
- Set maxsize=1000 for method-level caching
- Cache spell lists, race lists, and class information

### Persistent File-Based Caching
- Store cached content in `cache/` directory
- Use pickle serialization for Python objects
- Implement cache invalidation based on file age
- Cache structure: `cache/{endpoint.replace('/', '_')}.pkl`

### Cache Management
- Default TTL: 24 hours for static content
- Shorter TTL (1 hour) for homepage/index pages that might link to new content
- Implement cache warming for high-priority content
- Graceful cache miss handling with fallback to web scraping

### Cache Keys
- Use normalized endpoint paths as cache keys
- Handle URL parameters consistently
- Implement cache versioning for schema changes

## Implementation Details

```python
@lru_cache(maxsize=1000)
def _cached_fetch(self, endpoint: str) -> Optional[str]:
    cache_file = f"cache/{endpoint.replace('/', '_')}.pkl"
    
    if os.path.exists(cache_file):
        # Check if cache is still valid (24 hours)
        if time.time() - os.path.getmtime(cache_file) < 86400:
            with open(cache_file, 'rb') as f:
                return pickle.load(f)
    
    # Cache miss - fetch from web
    soup = self._safe_fetch(endpoint)
    if soup:
        os.makedirs('cache', exist_ok=True)
        with open(cache_file, 'wb') as f:
            pickle.dump(str(soup), f)
        return str(soup)
    
    return None
```

## Alternatives Considered
1. **Redis/External Cache**: Adds deployment complexity for single-user tool
2. **No Caching**: Would overload wiki server and have poor performance
3. **Database Caching**: Overkill for read-only reference data
4. **HTTP-level Caching**: Less control over cache behavior and invalidation

## Consequences

### Positive
- Dramatic performance improvement (sub-second responses vs multi-second web requests)
- Reduced server load and ethical scraping compliance
- Offline capability for cached content
- Better user experience with consistent response times

### Negative
- Additional disk space usage (estimated 50-100MB for full content)
- Cache invalidation complexity
- Potential for serving stale data
- Initial cache warming time

### Risks
- Cache corruption requiring rebuild
- Disk space exhaustion in long-running deployments
- Memory usage growth with LRU cache

## Monitoring and Maintenance
- Log cache hit/miss ratios for optimization
- Implement cache size monitoring and cleanup
- Add manual cache refresh capabilities
- Consider cache preloading for critical content

## Future Considerations
- Implement cache compression for large datasets
- Add cache synchronization for multi-instance deployments
- Consider CDN integration for public deployments
- Implement smart cache invalidation based on content change detection