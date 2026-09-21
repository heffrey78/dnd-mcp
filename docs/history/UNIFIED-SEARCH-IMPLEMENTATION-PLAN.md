# Comprehensive Unified Search Implementation Plan

## 📋 Overview

This document outlines the implementation plan for a comprehensive unified search system that aggregates all D&D content types from the Open5e API into a single, intelligent search interface.

## 🎯 Requirements Analysis

### Functional Requirements (from REQ-0009-TECH-00)
- ✅ Implement unified_search MCP tool for cross-content search
- ✅ Search across spells, monsters, items, feats, races, classes simultaneously  
- ✅ Provide intelligent result ranking and relevance scoring
- ✅ Include content type filtering and categorization
- ✅ Support fuzzy matching and partial name searches
- ✅ Provide related content suggestions
- ✅ Include search result summaries and previews
- ✅ Implement search history and suggestions

### Performance Requirements
- ⏱️ Search performance under 3 seconds for complex queries
- 📊 Intelligent caching strategy
- 🔄 Request deduplication for identical searches

## 🏗️ Architecture Design

### 1. **Current Search Infrastructure Analysis**

From our codebase analysis, we have:

#### **Existing Search Methods (Open5eClient):**
- `searchSpells(query?, options)` - Advanced spell filtering (level, school, etc.)
- `searchMonsters(query?, options)` - CR-based filtering, document filtering
- `searchRaces(query?)` - Basic text search with trait information
- `searchClasses()` - Complete class data retrieval
- `searchWeapons(query?, options)` - Property-based filtering (martial, finesse, etc.)
- `searchMagicItems(query?, options)` - Rarity and type filtering
- `searchArmor(query?, options)` - Category and AC filtering
- `searchFeats(query?, options)` - Prerequisite filtering
- `searchConditions(query?, options)` - Basic text search
- `searchBackgrounds(query?, options)` - Basic text search with benefits
- `searchSections(query?, options)` - Rules reference search
- `searchSpellLists(query?, options)` - Class-specific spell lists

#### **Current Caching Strategy:**
- **NodeCache** with 30-minute TTL
- **Cache Keys**: `${path}?${sanitizedParams}`
- **Performance**: `useClones: false` optimization
- **Cleanup**: 60-second interval for expired keys

### 2. **Unified Search Architecture**

```typescript
// Core unified search interface
interface UnifiedSearchOptions {
  query: string;                          // Main search query (required)
  contentTypes?: ContentType[];           // Filter by content types
  limit?: number;                        // Max results per content type
  includeDetails?: boolean;              // Include full details vs previews
  fuzzyThreshold?: number;               // Fuzzy matching sensitivity (0.0-1.0)
  sortBy?: 'relevance' | 'name' | 'type'; // Result sorting strategy
  filters?: ContentTypeFilters;          // Type-specific filtering
}

// Content type enumeration
type ContentType = 
  | 'spells' | 'monsters' | 'races' | 'classes'
  | 'weapons' | 'armor' | 'magic-items' | 'feats' 
  | 'conditions' | 'backgrounds' | 'sections' | 'spell-lists';

// Unified search result structure
interface UnifiedSearchResult {
  query: string;
  totalResults: number;
  executionTime: number;
  results: {
    [K in ContentType]: {
      count: number;
      items: SearchResultItem<K>[];
      hasMore: boolean;
    };
  };
  suggestions?: string[];              // Alternative query suggestions
  relatedContent?: RelatedContentItem[]; // Cross-content connections
}
```

### 3. **Search Implementation Strategy**

#### **Phase 1: Core Unified Interface**
1. **Aggregator Pattern Implementation**
   - Create `UnifiedSearchEngine` class
   - Orchestrate parallel searches across all content types
   - Aggregate and normalize results

2. **Result Ranking Algorithm**
   - **Exact Match Priority**: Exact name matches rank highest
   - **Fuzzy Match Scoring**: Using Levenshtein distance algorithm
   - **Content Type Weighting**: Prioritize commonly searched types
   - **Relevance Scoring**: Combine match quality with content popularity

3. **Performance Optimization**
   - **Parallel Execution**: Use `Promise.all()` for concurrent API calls
   - **Smart Caching**: Cache unified results separately from individual searches
   - **Request Deduplication**: Prevent duplicate API calls within same search
   - **Progressive Loading**: Return results as they become available

#### **Phase 2: Advanced Features**
1. **Fuzzy Matching Enhancement**
   - Integrate **Fuse.js** for advanced fuzzy search capabilities
   - Configure weighted search across multiple fields (name, description, etc.)
   - Implement typo tolerance and partial matching

2. **Content Relationship Mapping**
   - **Spell-Class Connections**: Link spells to classes that can cast them
   - **Monster-Environment Mapping**: Connect monsters to appropriate environments
   - **Equipment-Class Synergy**: Link equipment to classes that benefit most
   - **Cross-Reference Suggestions**: "Users searching for X also looked at Y"

#### **Phase 3: Intelligent Features**
1. **Search Suggestions & Autocomplete**
   - Build search term frequency database
   - Implement real-time suggestions after 3 characters
   - Provide "did you mean?" corrections for typos

2. **Content Previews & Summaries**
   - Generate condensed previews for quick scanning
   - Highlight matching terms in descriptions
   - Provide key statistics (CR for monsters, level for spells, etc.)

## 🔧 Technical Implementation Plan

### 1. **Core Search Engine Implementation**

```typescript
// src/unified-search-engine.ts
export class UnifiedSearchEngine {
  private open5eClient: Open5eClient;
  private fuse: Fuse<any>[];            // Fuse.js instances per content type
  private cache: NodeCache;
  
  constructor() {
    this.open5eClient = new Open5eClient();
    this.cache = new NodeCache({ stdTTL: 1800 }); // 30 min cache
    this.initializeFuzzySearch();
  }
  
  async unifiedSearch(options: UnifiedSearchOptions): Promise<UnifiedSearchResult> {
    const startTime = Date.now();
    
    // Check cache first
    const cacheKey = this.generateCacheKey(options);
    const cached = this.cache.get<UnifiedSearchResult>(cacheKey);
    if (cached) return cached;
    
    // Execute parallel searches
    const searchPromises = this.buildSearchPromises(options);
    const searchResults = await Promise.allSettled(searchPromises);
    
    // Aggregate and rank results
    const aggregatedResults = this.aggregateResults(searchResults, options);
    
    // Generate suggestions and related content
    const suggestions = await this.generateSuggestions(options.query, aggregatedResults);
    const relatedContent = await this.findRelatedContent(aggregatedResults);
    
    const result: UnifiedSearchResult = {
      query: options.query,
      totalResults: this.calculateTotalResults(aggregatedResults),
      executionTime: Date.now() - startTime,
      results: aggregatedResults,
      suggestions,
      relatedContent
    };
    
    // Cache result
    this.cache.set(cacheKey, result);
    return result;
  }
  
  private buildSearchPromises(options: UnifiedSearchOptions): Promise<any>[] {
    const promises: Promise<any>[] = [];
    const contentTypes = options.contentTypes || this.getAllContentTypes();
    
    for (const contentType of contentTypes) {
      switch (contentType) {
        case 'spells':
          promises.push(this.searchSpells(options));
          break;
        case 'monsters':
          promises.push(this.searchMonsters(options));
          break;
        // ... other content types
      }
    }
    
    return promises;
  }
  
  private rankResults(results: any[], query: string): any[] {
    return results
      .map(item => ({
        ...item,
        relevanceScore: this.calculateRelevanceScore(item, query)
      }))
      .sort((a, b) => b.relevanceScore - a.relevanceScore);
  }
  
  private calculateRelevanceScore(item: any, query: string): number {
    let score = 0;
    
    // Exact name match gets highest score
    if (item.name.toLowerCase() === query.toLowerCase()) {
      score += 100;
    }
    
    // Partial name match
    if (item.name.toLowerCase().includes(query.toLowerCase())) {
      score += 50;
    }
    
    // Description relevance using Fuse.js score
    if (item.fuseScore) {
      score += (1 - item.fuseScore) * 30; // Fuse.js scores are 0-1, lower is better
    }
    
    // Content type weighting (spells and monsters are most searched)
    const typeWeights = {
      spells: 1.2, monsters: 1.1, classes: 1.0, races: 1.0,
      'magic-items': 0.9, weapons: 0.8, armor: 0.8, feats: 0.7,
      conditions: 0.6, backgrounds: 0.6, sections: 0.5, 'spell-lists': 0.5
    };
    score *= typeWeights[item.contentType] || 1.0;
    
    return score;
  }
}
```

### 2. **MCP Tool Integration**

```typescript
// src/index.ts additions
{
  name: 'unified_search',
  description: 'Search across all D&D content types (spells, monsters, items, races, etc.) with intelligent ranking and filtering',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query (required)',
        minLength: 1
      },
      content_types: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['spells', 'monsters', 'races', 'classes', 'weapons', 'armor', 'magic-items', 'feats', 'conditions', 'backgrounds', 'sections', 'spell-lists']
        },
        description: 'Filter by specific content types (optional - searches all if not specified)'
      },
      limit: {
        type: 'number',
        description: 'Maximum results per content type (default: 5)',
        minimum: 1,
        maximum: 20
      },
      include_details: {
        type: 'boolean',
        description: 'Include full details vs summary previews (default: false)'
      },
      fuzzy_threshold: {
        type: 'number',
        description: 'Fuzzy matching sensitivity 0.0-1.0 (default: 0.3)',
        minimum: 0.0,
        maximum: 1.0
      },
      sort_by: {
        type: 'string',
        enum: ['relevance', 'name', 'type'],
        description: 'Result sorting strategy (default: relevance)'
      }
    },
    required: ['query']
  }
}
```

### 3. **Fuzzy Search Integration with Fuse.js**

```typescript
// Install Fuse.js
// npm install fuse.js @types/fuse.js

import Fuse from 'fuse.js';

private initializeFuzzySearch(): void {
  // Configure Fuse.js for different content types
  const baseOptions = {
    includeScore: true,
    threshold: 0.3,        // 0.0 = exact match, 1.0 = match anything
    distance: 100,         // Character distance for fuzzy matching
    minMatchCharLength: 2, // Minimum characters to trigger search
  };
  
  // Spells fuzzy search configuration
  this.fuseConfigs.spells = new Fuse([], {
    ...baseOptions,
    keys: [
      { name: 'name', weight: 2.0 },           // Name has highest weight
      { name: 'description', weight: 1.0 },     // Description secondary
      { name: 'school', weight: 0.8 },         // School tertiary
      { name: 'classes', weight: 0.6 }         // Classes lower weight
    ]
  });
  
  // Monsters fuzzy search configuration
  this.fuseConfigs.monsters = new Fuse([], {
    ...baseOptions,
    keys: [
      { name: 'name', weight: 2.0 },
      { name: 'type', weight: 1.5 },
      { name: 'description', weight: 1.0 },
      { name: 'challengeRating', weight: 0.5 }
    ]
  });
  
  // ... configure for other content types
}
```

### 4. **Related Content Discovery**

```typescript
private async findRelatedContent(results: AggregatedResults): Promise<RelatedContentItem[]> {
  const related: RelatedContentItem[] = [];
  
  // Find spell-class relationships
  for (const spell of results.spells.items) {
    if (spell.classes) {
      for (const className of spell.classes) {
        const classMatch = results.classes.items.find(c => 
          c.name.toLowerCase().includes(className.toLowerCase())
        );
        if (classMatch) {
          related.push({
            type: 'spell-class',
            primary: spell,
            secondary: classMatch,
            relationship: `${spell.name} can be cast by ${classMatch.name}s`
          });
        }
      }
    }
  }
  
  // Find equipment-class synergies
  for (const weapon of results.weapons.items) {
    for (const cls of results.classes.items) {
      if (this.checkWeaponClassSynergy(weapon, cls)) {
        related.push({
          type: 'equipment-class',
          primary: weapon,
          secondary: cls,
          relationship: `${weapon.name} is well-suited for ${cls.name}s`
        });
      }
    }
  }
  
  return related.slice(0, 10); // Limit to top 10 relationships
}
```

## 📊 Performance Optimization Strategy

### 1. **Caching Strategy**
- **L1 Cache**: Individual API endpoint results (existing - 30 min TTL)
- **L2 Cache**: Unified search results (30 min TTL, larger key space)
- **L3 Cache**: Fuzzy search indices (1 hour TTL, updated when content changes)

### 2. **Request Optimization**
- **Parallel Execution**: All content type searches run concurrently
- **Request Deduplication**: Track in-flight requests to prevent duplicates
- **Smart Batching**: Combine similar requests where possible
- **Progressive Results**: Return results as they become available (streaming)

### 3. **Memory Management**
- **Fuse.js Index Optimization**: Only keep most commonly searched indices in memory
- **Result Truncation**: Limit individual content type results to prevent memory bloat
- **Cache Size Limits**: Implement LRU eviction for unified search cache

## 🧪 Testing Strategy

### 1. **Unit Tests**
```typescript
// test/unified-search.test.ts
describe('UnifiedSearchEngine', () => {
  let searchEngine: UnifiedSearchEngine;
  
  beforeEach(() => {
    searchEngine = new UnifiedSearchEngine();
  });
  
  it('should search across all content types', async () => {
    const result = await searchEngine.unifiedSearch({
      query: 'fireball',
      limit: 5
    });
    
    expect(result.results.spells.items).toHaveLength(1);
    expect(result.results.spells.items[0].name).toBe('Fireball');
    expect(result.totalResults).toBeGreaterThan(0);
  });
  
  it('should rank exact matches higher than partial matches', async () => {
    const result = await searchEngine.unifiedSearch({
      query: 'fire',
      contentTypes: ['spells'],
      limit: 10
    });
    
    const fireballIndex = result.results.spells.items.findIndex(s => s.name === 'Fireball');
    const fireShieldIndex = result.results.spells.items.findIndex(s => s.name === 'Fire Shield');
    
    // Exact matches should appear before partial matches
    expect(fireballIndex).toBeLessThan(fireShieldIndex);
  });
});
```

### 2. **Integration Tests**
- Test complete search workflows with real Open5e API data
- Performance testing with concurrent searches
- Cache effectiveness validation

### 3. **Performance Benchmarks**
- Measure search execution time under various loads
- Memory usage profiling with large result sets
- Cache hit rate analysis

## 📈 Success Metrics

### 1. **Performance Metrics**
- ✅ Search completion under 3 seconds (target: < 2 seconds)
- ✅ Cache hit rate > 70% for repeated searches
- ✅ Memory usage < 50MB for search indices

### 2. **Quality Metrics**
- ✅ Relevance scoring accuracy (manual testing with known queries)
- ✅ Fuzzy matching effectiveness (handle common typos)
- ✅ Related content discovery quality (meaningful relationships)

### 3. **Usability Metrics**
- ✅ Search result completeness (all relevant content found)
- ✅ Response format consistency and clarity
- ✅ Error handling robustness

## 🚀 Implementation Timeline

### **Phase 1: Core Implementation (Week 1)**
- [ ] Implement UnifiedSearchEngine class
- [ ] Add unified_search MCP tool 
- [ ] Basic result aggregation and ranking
- [ ] Unit tests for core functionality

### **Phase 2: Fuzzy Search (Week 1-2)**
- [ ] Integrate Fuse.js for advanced matching
- [ ] Configure content-specific search weights
- [ ] Performance optimization for search indices

### **Phase 3: Advanced Features (Week 2)**
- [ ] Related content discovery
- [ ] Search suggestions and autocomplete
- [ ] Content previews and summaries

### **Phase 4: Polish & Testing (Week 2)**
- [ ] Comprehensive integration testing
- [ ] Performance benchmarking and optimization
- [ ] Documentation and examples

## 🔄 Future Enhancements

### **Phase 5: Machine Learning Integration**
- Query intent classification
- Personalized search results based on user patterns
- Advanced semantic search using embeddings

### **Phase 6: Real-time Features**
- Search result streaming for large queries
- Real-time autocomplete suggestions
- Live content updates and cache invalidation

---

## 📝 Notes

This plan builds upon our comprehensive Open5e API integration and leverages the existing caching infrastructure. The unified search will provide significant value by allowing users to find related D&D content across all categories with a single query.

The implementation prioritizes performance, relevance, and user experience while maintaining the robust error handling and data validation patterns established in the current codebase.