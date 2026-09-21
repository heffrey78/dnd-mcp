# ADR-001: Web Scraping Strategy for D&D 5e Wiki

## Status
Superseded

Superseded by [ADR-006](006-open5e-api-migration.md). The WikiDot scraper was removed; content now comes from the Open5e API.

## Context
The D&D 5e MCP server needs to extract structured content from dnd5e.wikidot.com, which is a community-maintained wiki with consistent URL patterns but mixed content quality. The guide analysis reveals specific endpoint patterns and content structures that need to be handled.

## Decision
We will implement a targeted web scraping strategy with the following components:

### URL Pattern Recognition
- Base URL: `https://dnd5e.wikidot.com`
- Structured endpoints following predictable patterns:
  - `/spells` - Master spell list
  - `/spells:{class}` - Class-specific spell lists  
  - `/lineage` - Race/lineage master list
  - `/lineage:{race}` - Individual race pages
  - `/{class}` - Base class pages
  - `/{class}:{subclass}` - Subclass pages

### Content Extraction Strategy
- Use BeautifulSoup for HTML parsing
- Target `div#page-content` as primary content container
- Extract structured data from tables and lists
- Handle hierarchical content with category parsing
- Implement fallback parsing for edge cases

### Request Management
- Use requests.Session for connection reuse
- Set appropriate User-Agent: "DnD5e-MCP-Service/1.0"
- Implement exponential backoff retry logic
- Handle network timeouts gracefully

## Alternatives Considered
1. **API Integration**: No official API available for dnd5e.wikidot.com
2. **Database Scraping**: Would require maintaining local D&D content database
3. **Third-party APIs**: Limited coverage and reliability concerns

## Consequences

### Positive
- Comprehensive access to D&D 5e content
- Structured data extraction from predictable patterns
- Ability to handle mixed content quality
- Future-proof against minor site changes

### Negative
- Dependency on external site availability
- Potential breaking changes if site structure changes significantly
- Need for ongoing maintenance and monitoring
- Legal/ethical considerations around scraping

### Risks
- Site blocking due to excessive requests
- Content structure changes requiring parser updates
- Network reliability issues affecting service availability

## Implementation Notes
- Respect robots.txt and implement rate limiting
- Add comprehensive error handling and logging
- Consider implementing circuit breaker pattern for reliability
- Plan for graceful degradation when scraping fails