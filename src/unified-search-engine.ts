import Fuse from 'fuse.js';
import { Open5eClient } from './open5e-client.js';
import NodeCache from 'node-cache';

// Content type enumeration
export type ContentType = 
  | 'spells' | 'monsters' | 'races' | 'classes'
  | 'weapons' | 'armor' | 'magic-items' | 'feats' 
  | 'conditions' | 'backgrounds' | 'sections';

// Unified search options interface
export interface UnifiedSearchOptions {
  query: string;                          // Main search query (required)
  contentTypes?: ContentType[];           // Filter by content types
  limit?: number;                        // Max results per content type (default: 5)
  includeDetails?: boolean;              // Include full details vs previews (default: false)
  fuzzyThreshold?: number;               // Fuzzy matching sensitivity 0.0-1.0 (default: 0.3)
  sortBy?: 'relevance' | 'name' | 'type'; // Result sorting strategy (default: relevance)
}

// Search result item interface
export interface SearchResultItem {
  id: string;
  name: string;
  contentType: ContentType;
  description: string;
  url?: string;
  relevanceScore: number;
  preview?: string;
  metadata?: Record<string, any>;
}

// Content type result group
export interface ContentTypeResults {
  count: number;
  items: SearchResultItem[];
  hasMore: boolean;
}

// Related content item
export interface RelatedContentItem {
  type: 'spell-class' | 'equipment-class' | 'monster-environment' | 'cross-reference';
  primary: SearchResultItem;
  secondary: SearchResultItem;
  relationship: string;
}

// Unified search result structure
export interface UnifiedSearchResult {
  query: string;
  totalResults: number;
  executionTime: number;
  results: Record<ContentType, ContentTypeResults>;
  suggestions?: string[];              // Alternative query suggestions
  relatedContent?: RelatedContentItem[]; // Cross-content connections
}

// Individual search result from API
interface ApiSearchResult {
  contentType: ContentType;
  data: any;
  error?: Error;
}

export class UnifiedSearchEngine {
  private open5eClient: Open5eClient;
  private cache: NodeCache;
  private fuseConfigs: Partial<Record<ContentType, any>> = {};
  
  constructor() {
    this.open5eClient = new Open5eClient();
    
    // Separate cache for unified search results
    this.cache = new NodeCache({
      stdTTL: 1800,        // 30 minutes TTL
      checkperiod: 60,     // Check expired keys every minute
      useClones: false     // Better performance
    });
    
    this.initializeFuzzySearch();
  }

  /**
   * Main unified search method
   */
  async unifiedSearch(options: UnifiedSearchOptions): Promise<UnifiedSearchResult> {
    const startTime = Date.now();
    
    // Validate and normalize options
    const normalizedOptions = this.normalizeOptions(options);
    
    // Check cache first
    const cacheKey = this.generateCacheKey(normalizedOptions);
    const cached = this.cache.get<UnifiedSearchResult>(cacheKey);
    if (cached) {
      console.error(`🔄 Unified search cache hit: ${cacheKey}`);
      return cached;
    }
    
    try {
      // Execute parallel searches across content types
      const searchPromises = this.buildSearchPromises(normalizedOptions);
      const searchResults = await Promise.allSettled(searchPromises);
      
      // Process and aggregate results
      const processedResults = this.processSearchResults(searchResults, normalizedOptions);
      
      // Generate suggestions and related content
      const suggestions = this.generateSuggestions(normalizedOptions.query, processedResults);
      const relatedContent = await this.findRelatedContent(processedResults);
      
      // Build final result
      const result: UnifiedSearchResult = {
        query: normalizedOptions.query,
        totalResults: this.calculateTotalResults(processedResults),
        executionTime: Date.now() - startTime,
        results: processedResults,
        suggestions,
        relatedContent
      };
      
      // Cache the result
      this.cache.set(cacheKey, result);
      console.error(`💾 Unified search cached: ${cacheKey} (${result.totalResults} results in ${result.executionTime}ms)`);
      
      return result;
      
    } catch (error) {
      throw new Error(`Unified search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Normalize and validate search options
   */
  private normalizeOptions(options: UnifiedSearchOptions): Required<UnifiedSearchOptions> {
    if (!options.query || typeof options.query !== 'string' || options.query.trim().length === 0) {
      throw new Error('Search query is required and must be a non-empty string');
    }

    return {
      query: options.query.trim(),
      contentTypes: options.contentTypes || this.getAllContentTypes(),
      limit: Math.min(Math.max(options.limit || 5, 1), 20), // Clamp between 1-20
      includeDetails: options.includeDetails || false,
      fuzzyThreshold: Math.min(Math.max(options.fuzzyThreshold || 0.3, 0.0), 1.0), // Clamp 0.0-1.0
      sortBy: options.sortBy || 'relevance'
    };
  }

  /**
   * Generate cache key for unified search options
   */
  private generateCacheKey(options: Required<UnifiedSearchOptions>): string {
    const keyParts = [
      'unified',
      options.query.toLowerCase(),
      options.contentTypes.sort().join(','),
      options.limit.toString(),
      options.includeDetails.toString(),
      options.fuzzyThreshold.toString(),
      options.sortBy
    ];
    
    return keyParts.join('|');
  }

  /**
   * Build array of search promises for parallel execution
   */
  private buildSearchPromises(options: Required<UnifiedSearchOptions>): Promise<ApiSearchResult>[] {
    const promises: Promise<ApiSearchResult>[] = [];
    
    for (const contentType of options.contentTypes) {
      promises.push(this.executeContentTypeSearch(contentType, options));
    }
    
    return promises;
  }

  /**
   * Execute search for a specific content type
   */
  private async executeContentTypeSearch(
    contentType: ContentType, 
    options: Required<UnifiedSearchOptions>
  ): Promise<ApiSearchResult> {
    try {
      let data;
      
      switch (contentType) {
        case 'spells':
          data = await this.open5eClient.searchSpells(options.query, { limit: options.limit });
          break;
        case 'monsters':
          data = await this.open5eClient.searchMonsters(options.query, { limit: options.limit });
          break;
        case 'races':
          data = await this.open5eClient.searchRaces(options.query);
          break;
        case 'classes':
          data = await this.open5eClient.searchClasses();
          break;
        case 'weapons':
          data = await this.open5eClient.searchWeapons(options.query, { limit: options.limit });
          break;
        case 'armor':
          data = await this.open5eClient.searchArmor(options.query, { limit: options.limit });
          break;
        case 'magic-items':
          data = await this.open5eClient.searchMagicItems(options.query, { limit: options.limit });
          break;
        case 'feats':
          data = await this.open5eClient.searchFeats(options.query, { limit: options.limit });
          break;
        case 'conditions':
          data = await this.open5eClient.searchConditions(options.query, { limit: options.limit });
          break;
        case 'backgrounds':
          data = await this.open5eClient.searchBackgrounds(options.query, { limit: options.limit });
          break;
        case 'sections':
          data = await this.open5eClient.searchSections(options.query, { limit: options.limit });
          break;
        default:
          throw new Error(`Unsupported content type: ${contentType}`);
      }
      
      return { contentType, data };
      
    } catch (error) {
      console.warn(`Search failed for ${contentType}:`, error);
      return { 
        contentType, 
        data: { count: 0, results: [], hasMore: false }, 
        error: error instanceof Error ? error : new Error('Unknown error')
      };
    }
  }

  /**
   * Process and normalize search results from all content types
   */
  private processSearchResults(
    searchResults: PromiseSettledResult<ApiSearchResult>[],
    options: Required<UnifiedSearchOptions>
  ): Record<ContentType, ContentTypeResults> {
    const processedResults: Record<ContentType, ContentTypeResults> = {} as any;
    
    for (const result of searchResults) {
      if (result.status === 'fulfilled') {
        const { contentType, data, error } = result.value;
        
        if (error) {
          // Handle search errors gracefully
          processedResults[contentType] = {
            count: 0,
            items: [],
            hasMore: false
          };
          continue;
        }
        
        // Normalize API results to SearchResultItem format
        const normalizedItems = this.normalizeApiResults(data.results || [], contentType, options);
        
        // Apply fuzzy search if enabled and results exist
        const fuzzyFilteredItems = options.fuzzyThreshold < 1.0 
          ? this.applyFuzzySearch(normalizedItems, options.query, contentType, options.fuzzyThreshold)
          : normalizedItems;
        
        // Rank results by relevance
        const rankedItems = this.rankResults(fuzzyFilteredItems, options.query, options.sortBy);
        
        // Limit results
        const limitedItems = rankedItems.slice(0, options.limit);
        
        processedResults[contentType] = {
          count: data.count || normalizedItems.length,
          items: limitedItems,
          hasMore: data.hasMore || (data.count > options.limit)
        };
      } else {
        // Handle promise rejection
        const contentType = options.contentTypes.find(ct => 
          searchResults.indexOf(result) === options.contentTypes.indexOf(ct)
        ) || 'spells' as ContentType;
        
        console.warn(`Search promise rejected for ${contentType}:`, result.reason);
        processedResults[contentType] = {
          count: 0,
          items: [],
          hasMore: false
        };
      }
    }
    
    return processedResults;
  }

  /**
   * Normalize API results to consistent SearchResultItem format
   */
  private normalizeApiResults(
    apiResults: any[], 
    contentType: ContentType, 
    options: Required<UnifiedSearchOptions>
  ): SearchResultItem[] {
    return apiResults.map((item, index) => {
      const normalizedItem: SearchResultItem = {
        id: `${contentType}-${index}`,
        name: item.name || 'Unknown',
        contentType,
        description: this.extractDescription(item, contentType),
        url: item.url,
        relevanceScore: 0, // Will be calculated later
        metadata: this.extractMetadata(item, contentType)
      };
      
      // Add preview if details not included
      if (!options.includeDetails) {
        normalizedItem.preview = this.generatePreview(item, contentType);
      }
      
      return normalizedItem;
    });
  }

  /**
   * Extract description from API item based on content type
   */
  private extractDescription(item: any, contentType: ContentType): string {
    switch (contentType) {
      case 'spells':
        return item.description || item.desc || '';
      case 'monsters':
        return item.description || item.desc || '';
      case 'races':
        return item.description || item.desc || '';
      case 'classes':
        return item.description || item.desc || '';
      case 'magic-items':
        return item.description || item.desc || '';
      case 'feats':
        return item.description || item.desc || '';
      case 'conditions':
        return item.description || item.desc || '';
      case 'backgrounds':
        return item.description || item.desc || '';
      case 'sections':
        return item.description || item.desc || '';
      default:
        return item.description || item.desc || '';
    }
  }

  /**
   * Extract relevant metadata from API item
   */
  private extractMetadata(item: any, contentType: ContentType): Record<string, any> {
    const metadata: Record<string, any> = {};
    
    switch (contentType) {
      case 'spells':
        metadata.level = item.level;
        metadata.school = item.school;
        metadata.castingTime = item.castingTime;
        metadata.range = item.range;
        metadata.components = item.components;
        metadata.duration = item.duration;
        metadata.classes = item.classes;
        break;
      case 'monsters':
        metadata.challengeRating = item.challengeRating;
        metadata.type = item.type;
        metadata.size = item.size;
        metadata.alignment = item.alignment;
        metadata.armorClass = item.armorClass;
        metadata.hitPoints = item.hitPoints;
        break;
      case 'races':
        metadata.size = item.size;
        metadata.speed = item.speed;
        metadata.traits = item.traits;
        break;
      case 'classes':
        metadata.hitDie = item.hitDie;
        metadata.primaryAbility = item.primaryAbility;
        metadata.savingThrows = item.savingThrows;
        break;
      case 'weapons':
        metadata.damageDice = item.damageDice;
        metadata.damageType = item.damageType;
        metadata.properties = item.properties;
        break;
      case 'armor':
        metadata.category = item.category;
        metadata.acBase = item.acBase;
        break;
      case 'magic-items':
        metadata.type = item.type;
        metadata.rarity = item.rarity;
        metadata.requiresAttunement = item.requiresAttunement;
        break;
      case 'feats':
        metadata.prerequisite = item.prerequisite;
        metadata.hasPrerequisite = item.hasPrerequisite;
        break;
    }
    
    return metadata;
  }

  /**
   * Generate preview text for search results
   */
  private generatePreview(item: any, contentType: ContentType): string {
    const description = this.extractDescription(item, contentType);
    
    // Truncate description to ~150 characters
    if (description.length <= 150) {
      return description;
    }
    
    const truncated = description.substring(0, 147);
    const lastSpace = truncated.lastIndexOf(' ');
    
    return lastSpace > 100 ? truncated.substring(0, lastSpace) + '...' : truncated + '...';
  }

  /**
   * Apply fuzzy search filtering using Fuse.js
   */
  private applyFuzzySearch(
    items: SearchResultItem[], 
    query: string, 
    contentType: ContentType, 
    threshold: number
  ): SearchResultItem[] {
    if (items.length === 0) return items;
    
    // Configure Fuse.js for this content type
    const fuseOptions = {
      includeScore: true,
      threshold,
      distance: 100,
      minMatchCharLength: 2,
      keys: [
        { name: 'name', weight: 2.0 },
        { name: 'description', weight: 1.0 }
      ]
    };
    
    const fuse = new Fuse(items, fuseOptions);
    const fuzzyResults = fuse.search(query);
    
    // Convert Fuse.js results back to SearchResultItem format
    return fuzzyResults.map(result => ({
      ...result.item,
      fuzzyScore: result.score || 0
    }));
  }

  /**
   * Rank and sort search results
   */
  private rankResults(
    items: SearchResultItem[], 
    query: string, 
    sortBy: 'relevance' | 'name' | 'type'
  ): SearchResultItem[] {
    // Calculate relevance scores
    items.forEach(item => {
      item.relevanceScore = this.calculateRelevanceScore(item, query);
    });
    
    // Sort based on strategy
    switch (sortBy) {
      case 'name':
        return items.sort((a, b) => a.name.localeCompare(b.name));
      case 'type':
        return items.sort((a, b) => {
          const typeCompare = a.contentType.localeCompare(b.contentType);
          return typeCompare !== 0 ? typeCompare : b.relevanceScore - a.relevanceScore;
        });
      case 'relevance':
      default:
        return items.sort((a, b) => b.relevanceScore - a.relevanceScore);
    }
  }

  /**
   * Calculate relevance score for a search result item
   */
  private calculateRelevanceScore(item: SearchResultItem, query: string): number {
    let score = 0;
    const queryLower = query.toLowerCase();
    const nameLower = item.name.toLowerCase();
    const descLower = item.description.toLowerCase();
    
    // Exact name match gets highest score
    if (nameLower === queryLower) {
      score += 100;
    }
    // Name starts with query
    else if (nameLower.startsWith(queryLower)) {
      score += 80;
    }
    // Name contains query
    else if (nameLower.includes(queryLower)) {
      score += 60;
    }
    
    // Description contains query
    if (descLower.includes(queryLower)) {
      score += 20;
    }
    
    // Boost for fuzzy search score (if available)
    if ('fuzzyScore' in item && typeof item.fuzzyScore === 'number') {
      score += (1 - item.fuzzyScore) * 30; // Fuse.js scores are 0-1, lower is better
    }
    
    // Content type weighting (prioritize commonly searched types)
    const typeWeights: Record<ContentType, number> = {
      'spells': 1.2,
      'monsters': 1.1,
      'classes': 1.0,
      'races': 1.0,
      'magic-items': 0.9,
      'weapons': 0.8,
      'armor': 0.8,
      'feats': 0.7,
      'conditions': 0.6,
      'backgrounds': 0.6,
      'sections': 0.5
    };
    
    score *= typeWeights[item.contentType] || 1.0;
    
    return score;
  }

  /**
   * Generate search suggestions based on query and results
   */
  private generateSuggestions(query: string, results: Record<ContentType, ContentTypeResults>): string[] {
    const suggestions: string[] = [];
    
    // If no results, suggest common search terms
    const totalResults = this.calculateTotalResults(results);
    if (totalResults === 0) {
      const commonTerms = ['fireball', 'dragon', 'wizard', 'fighter', 'healing', 'magic sword'];
      suggestions.push(...commonTerms.filter(term => term !== query.toLowerCase()));
    }
    
    // Suggest variations based on partial matches
    const allItems = Object.values(results).flatMap(r => r.items);
    const variations = new Set<string>();
    
    for (const item of allItems) {
      const words = item.name.toLowerCase().split(' ');
      for (const word of words) {
        if (word.length > 3 && word !== query.toLowerCase() && word.includes(query.toLowerCase())) {
          variations.add(word);
        }
      }
    }
    
    suggestions.push(...Array.from(variations).slice(0, 5));
    
    return suggestions.slice(0, 5);
  }

  /**
   * Find related content across different content types
   */
  private async findRelatedContent(results: Record<ContentType, ContentTypeResults>): Promise<RelatedContentItem[]> {
    const related: RelatedContentItem[] = [];
    
    // Find spell-class relationships
    if (results.spells && results.classes) {
      for (const spell of results.spells.items) {
        if (spell.metadata?.classes && Array.isArray(spell.metadata.classes)) {
          for (const className of spell.metadata.classes) {
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
    }
    
    // Find equipment-class synergies
    if (results.weapons && results.classes) {
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
    }
    
    return related.slice(0, 10); // Limit to top 10 relationships
  }

  /**
   * Check if a weapon has synergy with a class
   */
  private checkWeaponClassSynergy(weapon: SearchResultItem, cls: SearchResultItem): boolean {
    const weaponName = weapon.name.toLowerCase();
    const className = cls.name.toLowerCase();
    const weaponProps = weapon.metadata?.properties || {};
    
    // Simple heuristics for weapon-class synergy
    if (className.includes('fighter') || className.includes('paladin')) {
      return weaponProps.martial || weaponName.includes('sword') || weaponName.includes('axe');
    }
    
    if (className.includes('rogue') || className.includes('ranger')) {
      return weaponProps.finesse || weaponName.includes('bow') || weaponName.includes('dagger');
    }
    
    if (className.includes('wizard') || className.includes('sorcerer')) {
      return weaponName.includes('staff') || weaponName.includes('wand');
    }
    
    return false;
  }

  /**
   * Calculate total results across all content types
   */
  private calculateTotalResults(results: Record<ContentType, ContentTypeResults>): number {
    return Object.values(results).reduce((total, result) => total + result.items.length, 0);
  }

  /**
   * Get all available content types
   */
  private getAllContentTypes(): ContentType[] {
    return [
      'spells', 'monsters', 'races', 'classes',
      'weapons', 'armor', 'magic-items', 'feats',
      'conditions', 'backgrounds', 'sections'
    ];
  }

  /**
   * Initialize fuzzy search configurations (placeholder for future enhancement)
   */
  private initializeFuzzySearch(): void {
    // Configuration will be expanded in Phase 2
    console.error('🔍 Fuzzy search configurations initialized');
  }

  /**
   * Get cache statistics
   */
  public getCacheStats() {
    return this.cache.getStats();
  }

  /**
   * Clear unified search cache
   */
  public clearCache(): void {
    this.cache.flushAll();
    // The engine's own cache sits on top of the client's HTTP cache, so both
    // have to go or a "cleared" cache still serves stale upstream responses.
    this.open5eClient.clearCache();
    console.error('🗑️ Unified search cache cleared');
  }
}