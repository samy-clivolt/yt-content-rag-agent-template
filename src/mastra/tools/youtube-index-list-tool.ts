import { createTool } from '@mastra/core';
import { z } from 'zod';
import { PgVector } from '@mastra/pg';

export const youtubeIndexListTool = createTool({
  id: 'youtube-index-list',
  description: 'List all indexes in the vector database with their statistics',
  inputSchema: z.object({
    includeStats: z.boolean().optional().default(true).describe('Include detailed statistics for each index')
  }),
  outputSchema: z.object({
    indexes: z.array(z.object({
      name: z.string(),
      category: z.string().optional(),
      stats: z.object({
        dimension: z.number(),
        count: z.number(),
        metric: z.enum(['cosine', 'euclidean', 'dotproduct']).optional(),
        type: z.enum(['flat', 'hnsw', 'ivfflat']),
        config: z.object({
          m: z.number().optional(),
          efConstruction: z.number().optional(),
          lists: z.number().optional(),
          probes: z.number().optional()
        })
      }).optional()
    })),
    totalIndexes: z.number(),
    schemaName: z.string()
  }),
  execute: async ({ context }) => {
    const { includeStats } = context;
    
    const connectionString = process.env.POSTGRES_CONNECTION_STRING;
    if (!connectionString) {
      throw new Error('POSTGRES_CONNECTION_STRING is not set in environment variables');
    }
    
    const pgVector = new PgVector({ 
      connectionString,
      schemaName: 'yt_rag'
    });
    
    try {
      // Get all indexes
      const indexes = await pgVector.listIndexes();
      
      // Get stats for each index if requested
      const indexesWithStats = await Promise.all(
        indexes.map(async (indexName) => {
          let stats = undefined;
          
          if (includeStats) {
            try {
              stats = await pgVector.describeIndex({ indexName });
            } catch (error) {
              console.error(`Failed to get stats for index ${indexName}:`, error);
            }
          }
          
          // Extract category from index name based on common patterns
          let category = indexName;
          if (indexName.includes('youtube_')) {
            category = indexName.replace(/^youtube_/, '').replace(/_/g, ' ');
          } else if (indexName.includes('yt_')) {
            category = indexName.replace(/^yt_/, '').replace(/_/g, ' ');
          } else {
            category = indexName.replace(/_/g, ' ');
          }
          
          return {
            name: indexName,
            category,
            stats
          };
        })
      );
      
      // Don't disconnect - let Mastra handle connection lifecycle
      
      return {
        indexes: indexesWithStats,
        totalIndexes: indexesWithStats.length,
        schemaName: 'yt_rag'
      };
    } catch (error) {
      // Don't disconnect - let Mastra handle connection lifecycle
      throw error;
    }
  }
});