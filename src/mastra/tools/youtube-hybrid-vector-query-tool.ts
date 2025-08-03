import { createTool } from '@mastra/core';
import { z } from 'zod';
import { PgVector } from '@mastra/pg';
import { embed } from 'ai';
import { openai } from '@ai-sdk/openai';

// Advanced filter operators
const filterOperators = z.enum(['$eq', '$ne', '$gt', '$gte', '$lt', '$lte', '$in', '$between', '$contains', '$startsWith', '$endsWith']);

// Simplified filter schema to avoid recursive references
const filterValue = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.union([z.string(), z.number()])),
  z.object({
    $eq: z.union([z.string(), z.number(), z.boolean()]).optional(),
    $ne: z.union([z.string(), z.number(), z.boolean()]).optional(),
    $gt: z.number().optional(),
    $gte: z.number().optional(),
    $lt: z.number().optional(),
    $lte: z.number().optional(),
    $in: z.array(z.union([z.string(), z.number()])).optional(),
    $between: z.array(z.number()).length(2).optional(), // Changed from tuple to array with length constraint
    $contains: z.string().optional(),
    $startsWith: z.string().optional(),
    $endsWith: z.string().optional(),
  })
]);

// Input schema with advanced filtering
const inputSchema = z.object({
  queryText: z.string().describe('The search query text'),
  indexName: z.string().describe('The name of the index to search in'),
  topK: z.number().optional().default(10).describe('Number of results to return'),
  filter: z.record(z.string(), filterValue).optional().describe('Advanced metadata filters'),
  scoringWeights: z.object({
    vector: z.number().optional().default(0.6),
    freshness: z.number().optional().default(0.2),
    popularity: z.number().optional().default(0.15),
    tags: z.number().optional().default(0.05),
  }).optional().describe('Weights for multi-criteria scoring'),
  includeScore: z.boolean().optional().default(true).describe('Include similarity scores in results'),
});

// Output schema
const outputSchema = z.object({
  relevantContext: z.array(z.any()),
  sources: z.array(z.object({
    id: z.string(),
    score: z.number(),
    hybridScore: z.number().optional(),
    metadata: z.any(),
    text: z.string().optional(),
    matchedFilters: z.array(z.string()).optional(),
  })),
  queryMetadata: z.object({
    indexName: z.string(),
    totalResults: z.number(),
    filtersApplied: z.number(),
    scoringMethod: z.string(),
  }),
});

// Helper function to build PostgreSQL filter query
const buildFilterQuery = (filter: any, paramIndex: number = 1): { query: string; params: any[]; nextIndex: number } => {
  const conditions: string[] = [];
  const params: any[] = [];
  let currentIndex = paramIndex;

  const processFilter = (key: string, value: any) => {
    // Handle logical operators
    if (key === '$and') {
      const andConditions = value.map((subFilter: any) => {
        const result = buildFilterQuery(subFilter, currentIndex);
        currentIndex = result.nextIndex;
        params.push(...result.params);
        return `(${result.query})`;
      });
      conditions.push(`(${andConditions.join(' AND ')})`);
      return;
    }

    if (key === '$or') {
      const orConditions = value.map((subFilter: any) => {
        const result = buildFilterQuery(subFilter, currentIndex);
        currentIndex = result.nextIndex;
        params.push(...result.params);
        return `(${result.query})`;
      });
      conditions.push(`(${orConditions.join(' OR ')})`);
      return;
    }

    if (key === '$not') {
      const result = buildFilterQuery(value, currentIndex);
      currentIndex = result.nextIndex;
      params.push(...result.params);
      conditions.push(`NOT (${result.query})`);
      return;
    }

    // Handle field-level operators
    if (typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date)) {
      Object.entries(value).forEach(([op, val]) => {
        const jsonPath = `metadata->>'${key}'`;
        
        switch (op) {
          case '$eq':
            conditions.push(`${jsonPath} = $${currentIndex}`);
            params.push(String(val));
            currentIndex++;
            break;
          case '$ne':
            conditions.push(`${jsonPath} != $${currentIndex}`);
            params.push(String(val));
            currentIndex++;
            break;
          case '$gt':
            conditions.push(`CAST(${jsonPath} AS NUMERIC) > $${currentIndex}`);
            params.push(val);
            currentIndex++;
            break;
          case '$gte':
            conditions.push(`CAST(${jsonPath} AS NUMERIC) >= $${currentIndex}`);
            params.push(val);
            currentIndex++;
            break;
          case '$lt':
            conditions.push(`CAST(${jsonPath} AS NUMERIC) < $${currentIndex}`);
            params.push(val);
            currentIndex++;
            break;
          case '$lte':
            conditions.push(`CAST(${jsonPath} AS NUMERIC) <= $${currentIndex}`);
            params.push(val);
            currentIndex++;
            break;
          case '$in':
            const inPlaceholders = (val as any[]).map((_, i) => `$${currentIndex + i}`);
            conditions.push(`${jsonPath} IN (${inPlaceholders.join(', ')})`);
            params.push(...(val as any[]));
            currentIndex += (val as any[]).length;
            break;
          case '$between':
            conditions.push(`CAST(${jsonPath} AS NUMERIC) BETWEEN $${currentIndex} AND $${currentIndex + 1}`);
            params.push((val as any[])[0], (val as any[])[1]);
            currentIndex += 2;
            break;
          case '$contains':
            conditions.push(`${jsonPath} LIKE $${currentIndex}`);
            params.push(`%${val}%`);
            currentIndex++;
            break;
          case '$startsWith':
            conditions.push(`${jsonPath} LIKE $${currentIndex}`);
            params.push(`${val}%`);
            currentIndex++;
            break;
          case '$endsWith':
            conditions.push(`${jsonPath} LIKE $${currentIndex}`);
            params.push(`%${val}`);
            currentIndex++;
            break;
        }
      });
    } else {
      // Simple equality
      conditions.push(`metadata->>'${key}' = $${currentIndex}`);
      params.push(String(value));
      currentIndex++;
    }
  };

  Object.entries(filter).forEach(([key, value]) => {
    processFilter(key, value);
  });

  return {
    query: conditions.join(' AND '),
    params,
    nextIndex: currentIndex,
  };
};

// Helper function to calculate hybrid scores
const calculateHybridScore = (
  vectorScore: number,
  metadata: any,
  queryText: string,
  weights: any
): number => {
  const now = new Date();
  
  // Freshness score (0-1, decays over time)
  const publishedDate = new Date(metadata.publishedAt);
  const daysSincePublished = (now.getTime() - publishedDate.getTime()) / (1000 * 60 * 60 * 24);
  const freshnessScore = Math.max(0, 1 - (daysSincePublished / 365)); // 1 year decay
  
  // Popularity score (0-1, normalized by log scale)
  const viewCount = metadata.viewCount || 0;
  const popularityScore = viewCount > 0 ? Math.min(1, Math.log10(viewCount + 1) / 6) : 0; // log10(1M) ≈ 6
  
  // Tag relevance score (0-1)
  const queryWords = queryText.toLowerCase().split(/\s+/);
  const tags = (metadata.tags || []).map((t: string) => t.toLowerCase());
  const tagMatches = queryWords.filter(word => 
    tags.some((tag: string) => tag.includes(word) || word.includes(tag))
  ).length;
  const tagScore = queryWords.length > 0 ? tagMatches / queryWords.length : 0;
  
  // Calculate weighted hybrid score
  return (
    weights.vector * vectorScore +
    weights.freshness * freshnessScore +
    weights.popularity * popularityScore +
    weights.tags * tagScore
  );
};

export const youtubeHybridVectorQueryTool = createTool({
  id: 'youtube-hybrid-vector-query',
  description: 'Advanced hybrid search combining vector similarity with metadata filtering and multi-criteria scoring',
  inputSchema,
  outputSchema,
  execute: async ({ context, mastra }) => {
    const { 
      queryText, 
      indexName, 
      topK = 10, 
      filter, 
      scoringWeights = { vector: 0.6, freshness: 0.2, popularity: 0.15, tags: 0.05 },
      includeScore = true 
    } = context;
    
    const logger = mastra?.getLogger ? mastra.getLogger() : undefined;
    
    try {
      // Get connection string
      const connectionString = process.env.POSTGRES_CONNECTION_STRING;
      if (!connectionString) {
        throw new Error('POSTGRES_CONNECTION_STRING is not set');
      }
      
      // Create PgVector instance
      const pgVector = new PgVector({
        connectionString,
        schemaName: 'yt_rag'
      });
      
      if (logger) {
        logger.debug('[YoutubeHybridVectorQuery] Executing search', { 
          queryText, 
          indexName, 
          topK, 
          filter,
          scoringWeights 
        });
      }
      
      // Generate embedding for the query
      const { embedding } = await embed({
        model: openai.embedding('text-embedding-3-small'),
        value: queryText,
      });
      
      // Build filter conditions
      let filterConditions = {};
      let appliedFilters = 0;
      
      if (filter) {
        const filterResult = buildFilterQuery(filter);
        if (filterResult.query) {
          // Convert the SQL WHERE clause to PgVector filter format
          // This is a simplified version - in practice, PgVector might need
          // the filter in a different format
          filterConditions = filter;
          appliedFilters = Object.keys(filter).length;
        }
      }
      
      // Perform vector search with filters
      const results = await pgVector.query({
        indexName,
        queryVector: embedding,
        filter: filterConditions,
        topK: topK * 2, // Get more results for re-ranking
        includeVector: false,
      });
      
      if (logger) {
        logger.debug('[YoutubeHybridVectorQuery] Initial results', { 
          count: results.length 
        });
      }
      
      // Calculate hybrid scores and re-rank
      const scoredResults = results.map(result => {
        const hybridScore = calculateHybridScore(
          result.score,
          result.metadata,
          queryText,
          scoringWeights
        );
        
        return {
          ...result,
          hybridScore,
        };
      });
      
      // Sort by hybrid score and take top K
      scoredResults.sort((a, b) => b.hybridScore - a.hybridScore);
      const topResults = scoredResults.slice(0, topK);
      
      // Format results
      const sources = topResults.map(result => ({
        id: result.id,
        score: includeScore ? result.score : 0,
        hybridScore: includeScore ? result.hybridScore : undefined,
        metadata: result.metadata,
        text: result.metadata?.text || result.metadata?.chapterText || '',
        matchedFilters: filter ? Object.keys(filter) : undefined,
      }));
      
      const relevantContext = topResults.map(result => result.metadata);
      
      // Don't disconnect - let Mastra handle connection lifecycle
      
      return {
        relevantContext,
        sources,
        queryMetadata: {
          indexName,
          totalResults: sources.length,
          filtersApplied: appliedFilters,
          scoringMethod: 'hybrid',
        },
      };
      
    } catch (error) {
      if (logger) {
        logger.error('[YoutubeHybridVectorQuery] Error during search', {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
      throw error;
    }
  },
});