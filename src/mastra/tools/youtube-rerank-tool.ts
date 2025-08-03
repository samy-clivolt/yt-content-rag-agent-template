import { createTool } from '@mastra/core';
import { z } from 'zod';
import { rerankWithScorer as rerank, CohereRelevanceScorer } from '@mastra/rag';

// Define the result schema for search results
const SearchResultSchema = z.object({
  score: z.number().optional(),
  metadata: z.record(z.any()),
  content: z.string(),
  vector_id: z.string().optional(),
  similarity: z.number().optional()
});

export const youtubeRerankTool = createTool({
  id: 'youtube-rerank-tool',
  description: 'Reranks YouTube search results using Cohere rerank API to improve relevance and quality',
  
  inputSchema: z.object({
    query: z.string().describe('The original search query'),
    results: z.array(SearchResultSchema).describe('Array of search results to rerank'),
    topK: z.number().default(10).describe('Number of top results to return after reranking'),
    model: z.enum(['rerank-english-v3.0', 'rerank-multilingual-v3.0', 'rerank-english-v2.0'])
      .default('rerank-multilingual-v3.0')
      .describe('Cohere rerank model to use')
  }),
  
  outputSchema: z.object({
    rerankedResults: z.array(z.object({
      originalIndex: z.number(),
      rerankScore: z.number(),
      result: SearchResultSchema,
      relevanceScore: z.number().optional()
    })),
    totalProcessed: z.number(),
    model: z.string()
  }),
  
  execute: async ({ context, mastra }) => {
    const { query, results, topK, model } = context;
    const logger = mastra?.getLogger ? mastra.getLogger() : undefined;
    
    if (results.length === 0) {
      return {
        rerankedResults: [],
        totalProcessed: 0,
        model
      };
    }
    
    // If we have fewer results than topK, no need to rerank
    if (results.length <= topK) {
      const rerankedResults = results.map((result: any, index: number) => ({
        originalIndex: index,
        rerankScore: 1 - (index / results.length),
        result,
        relevanceScore: 1 - (index / results.length)
      }));
      
      return {
        rerankedResults,
        totalProcessed: results.length,
        model
      };
    }
    
    try {
      // Check for Cohere API key
      const cohereApiKey = process.env.COHERE_API_KEY;
      if (!cohereApiKey) {
        throw new Error('COHERE_API_KEY environment variable is not set');
      }
      
      if (logger) {
        logger.debug('[YouTubeRerank] Starting Cohere reranking', { 
          queryLength: query.length,
          resultsCount: results.length,
          topK,
          model 
        });
      }
      
      // Add id property to results as required by QueryResult type
      const resultsWithId = results.map((result: any, index: number) => ({
        ...result,
        id: result.vector_id || `result-${index}`
      }));
      
      // Use Mastra's rerank method with CohereRelevanceScorer
      const rerankedSearchResults = await rerank({
        results: resultsWithId,
        query: query,
        scorer: new CohereRelevanceScorer(model),
        options: {
          topK: topK,
          weights: {
            semantic: 0.5,
            vector: 0.3,
            position: 0.2
          }
        }
      });
      
      // Map reranked results to our format
      const rerankedResults = rerankedSearchResults.map((result: any, index: number) => {
        // Find original index
        const originalIndex = results.findIndex((r: any) => 
          r.content === result.content && 
          r.metadata?.videoId === result.metadata?.videoId
        );
        
        return {
          originalIndex: originalIndex !== -1 ? originalIndex : index,
          rerankScore: result.score || (1 - (index / rerankedSearchResults.length)),
          result: result,
          relevanceScore: result.score || (1 - (index / rerankedSearchResults.length))
        };
      });
      
      if (logger) {
        logger.info('[YouTubeRerank] Cohere reranking completed', { 
          processed: results.length,
          returned: rerankedResults.length 
        });
      }
      
      return {
        rerankedResults,
        totalProcessed: results.length,
        model
      };
      
    } catch (error) {
      if (logger) {
        logger.error('[YouTubeRerank] Cohere reranking failed', { error });
      }
      
      // Fallback to original order
      const fallbackResults = results.slice(0, topK).map((result: any, index: number) => ({
        originalIndex: index,
        rerankScore: 1 - (index / topK),
        result,
        relevanceScore: 1 - (index / topK)
      }));
      
      return {
        rerankedResults: fallbackResults,
        totalProcessed: results.length,
        model
      };
    }
  }
});