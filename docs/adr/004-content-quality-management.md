# ADR-004: Content Quality Management

## Status
Superseded

Partially superseded by [ADR-006](006-open5e-api-migration.md). Open5e exposes source and licence per item via the `document` field, replacing the wiki content-tiering scheme.

## Context
The D&D 5e wiki contains mixed content quality with three distinct categories:
- **Official**: Published WotC content (Player's Handbook, DMG, etc.)
- **Unearthed Arcana**: Playtest content from WotC
- **Homebrew**: Community-created content

Users need to understand content source and quality for character building and campaign decisions. The guide analysis shows content can be categorized through text analysis and metadata extraction.

## Decision
Implement a content quality classification system that automatically categorizes content and provides quality metadata to users.

### Quality Categories
1. **Published/Official** - Core rulebooks and official supplements
2. **Unearthed Arcana** - Official playtest content  
3. **Homebrew** - Community content
4. **Unknown** - Content that cannot be reliably categorized

### Detection Strategy
```python
def get_content_metadata(self, endpoint: str) -> Dict:
    soup = self._fetch_page(endpoint)
    text = soup.get_text().lower()
    
    metadata = {
        'source': 'Unknown',
        'quality': 'Unknown', 
        'verified': False,
        'book_references': []
    }
    
    # Detection patterns
    if 'unearthed arcana' in text:
        metadata['source'] = 'Unearthed Arcana'
        metadata['quality'] = 'Playtest'
    elif 'homebrew' in text:
        metadata['source'] = 'Homebrew' 
        metadata['quality'] = 'Community'
    elif any(book in text for book in OFFICIAL_BOOKS):
        metadata['source'] = 'Official'
        metadata['quality'] = 'Published'
        metadata['verified'] = True
        
    return metadata
```

### Official Source References
Maintain list of official D&D 5e sources:
- Player's Handbook (PHB)
- Dungeon Master's Guide (DMG)  
- Monster Manual (MM)
- Xanathar's Guide to Everything (XGtE)
- Tasha's Cauldron of Everything (TCE)
- Volo's Guide to Monsters (VGtM)
- Mordenkainen's Tome of Foes (MTF)
- And other official supplements

### Quality Indicators in API Responses
Include quality metadata in all content responses:
```json
{
  "name": "Fireball",
  "level": 3,
  "school": "Evocation", 
  "quality": {
    "source": "Official",
    "verified": true,
    "book_references": ["Player's Handbook"],
    "reliability": "high"
  }
}
```

### User Experience Features
- **Quality Badges**: Visual indicators in responses
- **Filtering Options**: Allow users to filter by content quality
- **Warning System**: Clear warnings for homebrew/playtest content
- **Quality Scores**: Numeric reliability ratings (1-5 scale)

## Alternatives Considered
1. **Manual Curation**: Too labor-intensive and not scalable
2. **Community Voting**: Complex to implement, subjective quality measures
3. **No Quality Tracking**: Leaves users unable to distinguish official from homebrew
4. **External Quality Database**: Would require maintaining separate dataset

## Implementation Details

### Quality Detection Rules
- **Official Content**: Contains references to official books, no homebrew indicators
- **UA Content**: Explicitly labeled "Unearthed Arcana" or links to UA articles
- **Homebrew Content**: Contains "homebrew" text, community attribution, or non-official formatting
- **Uncertain Content**: Missing clear indicators, mixed signals

### Confidence Scoring
- **High Confidence (5)**: Clear official book references, verified formatting
- **Medium Confidence (3)**: Some indicators but not definitive  
- **Low Confidence (1)**: Conflicting or minimal quality signals

### Caching Quality Metadata
- Cache quality assessments to avoid repeated analysis
- Update quality cache less frequently than content cache
- Allow manual quality overrides for edge cases

## Consequences

### Positive
- Users can make informed decisions about content reliability
- Enables content filtering for official-only campaigns
- Builds trust through transparency about content sources
- Supports DMs in managing campaign content standards

### Negative  
- Additional processing overhead for quality analysis
- Risk of misclassification affecting user experience
- Maintenance burden for official source list updates
- Potential bias against community content

### Quality Risks
- False positives: Homebrew content marked as official
- False negatives: Official content marked as homebrew
- Evolution of content quality over time
- Subjective nature of "quality" assessment

## Monitoring and Maintenance
- Track quality classification accuracy through user feedback
- Regular audits of high-impact content (spells, races, classes)
- Update official source list with new releases
- Monitor for quality classification edge cases

## User Guidelines
- Clearly document quality categories and their meanings
- Provide guidance on using quality filters effectively  
- Explain limitations of automated quality detection
- Encourage user verification for campaign-critical content

## Future Enhancements
- Machine learning for improved quality classification
- Community quality ratings and feedback
- Integration with official D&D Beyond API when available
- Quality-based content recommendations