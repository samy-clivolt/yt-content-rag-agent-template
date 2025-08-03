import { createTool } from '@mastra/core';
import { z } from 'zod';
import { PgVector } from '@mastra/pg';
import { embed } from 'ai';
import { openai } from '@ai-sdk/openai';

// Input schema with index selection
const inputSchema = z.object({
  queryText: z.string().describe('The search query text'),
  indexName: z.string().describe('The name of the index to search in'),
  topK: z.number().optional().default(10).describe('Number of results to return'),
  filter: z.record(z.any()).optional().describe('Metadata filters to apply'),
});

// Output schema
const outputSchema = z.object({
  relevantContext: z.array(z.any()),
  sources: z.array(z.object({
    id: z.string(),
    score: z.number(),
    metadata: z.any(),
    text: z.string().optional(),
  })),
});

export const youtubeCustomVectorQueryTool = createTool({
  id: 'youtube-custom-vector-query',
  description: 'Search through indexed content with full control over index selection. Always use youtubeIndexListTool first to see available indexes.',
  inputSchema,
  outputSchema,
  execute: async ({ context, mastra }) => {
    const { queryText, indexName, topK = 10, filter } = context;
    
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
        logger.debug('[YoutubeCustomVectorQuery] Executing search', { 
          queryText, 
          indexName, 
          topK, 
          filter 
        });
      }
      
      // Generate embedding for the query
      const { embedding } = await embed({
        model: openai.embedding('text-embedding-3-small'),
        value: queryText,
      });
      
      // Perform vector search
      const results = await pgVector.query({
        indexName,
        queryVector: embedding,
        filter,
        topK,
        includeVector: false,
      });
      
      if (logger) {
        logger.debug('[YoutubeCustomVectorQuery] Search complete', { 
          resultsCount: results.length 
        });
      }
      
      // Format results
      const sources = results.map(result => ({
        id: result.id,
        score: result.score,
        metadata: result.metadata,
        text: result.metadata?.text || result.metadata?.chapterText || '',
      }));
      
      const relevantContext = results.map(result => result.metadata);
      
      // Don't disconnect - let Mastra handle connection lifecycle
      
      return {
        relevantContext,
        sources,
      };
      
    } catch (error) {
      if (logger) {
        logger.error('[YoutubeCustomVectorQuery] Error during search', {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
      throw error;
    }
  },
});