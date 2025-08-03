import { createTool } from '@mastra/core';
import { z } from 'zod';
import { createHybridSearchIndexes, checkHybridIndexesExist, getIndexStats } from '../utils/pgvector-index-optimizer';
import { PgVector } from '@mastra/pg';

export const youtubeIndexMaintenanceTool = createTool({
  id: 'youtube-index-maintenance',
  description: 'Maintain and optimize YouTube vector indexes with hybrid search capabilities',
  inputSchema: z.object({
    action: z.enum(['create-indexes', 'check-indexes', 'get-stats', 'optimize-all']).describe('Maintenance action to perform'),
    indexName: z.string().optional().describe('Specific index name (optional for optimize-all)'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
    details: z.any().optional(),
  }),
  execute: async ({ context }) => {
    const { action, indexName } = context;
    
    const connectionString = process.env.POSTGRES_CONNECTION_STRING;
    if (!connectionString) {
      throw new Error('POSTGRES_CONNECTION_STRING is not set in environment variables');
    }
    
    const pgVector = new PgVector({ 
      connectionString,
      schemaName: 'yt_rag'
    });
    
    try {
      switch (action) {
        case 'create-indexes':
          if (!indexName) {
            throw new Error('indexName is required for create-indexes action');
          }
          await createHybridSearchIndexes(indexName, connectionString, 'yt_rag');
          return {
            success: true,
            message: `Hybrid search indexes created successfully for ${indexName}`,
          };
          
        case 'check-indexes':
          if (!indexName) {
            throw new Error('indexName is required for check-indexes action');
          }
          const hasIndexes = await checkHybridIndexesExist(indexName, connectionString, 'yt_rag');
          return {
            success: true,
            message: hasIndexes 
              ? `Hybrid search indexes exist for ${indexName}` 
              : `No hybrid search indexes found for ${indexName}`,
            details: { hasIndexes },
          };
          
        case 'get-stats':
          if (!indexName) {
            throw new Error('indexName is required for get-stats action');
          }
          const stats = await getIndexStats(indexName, connectionString, 'yt_rag');
          return {
            success: true,
            message: `Retrieved statistics for ${indexName}`,
            details: { stats },
          };
          
        case 'optimize-all':
          const allIndexes = await pgVector.listIndexes();
          const results = [];
          
          for (const idx of allIndexes) {
            const hasHybridIndexes = await checkHybridIndexesExist(idx, connectionString, 'yt_rag');
            if (!hasHybridIndexes) {
              console.log(`Creating hybrid indexes for ${idx}...`);
              await createHybridSearchIndexes(idx, connectionString, 'yt_rag');
              results.push({ index: idx, status: 'created' });
            } else {
              results.push({ index: idx, status: 'already_exists' });
            }
          }
          
          return {
            success: true,
            message: `Optimized ${allIndexes.length} indexes`,
            details: { results },
          };
          
        default:
          throw new Error(`Unknown action: ${action}`);
      }
    } catch (error) {
      return {
        success: false,
        message: `Error during ${action}: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});