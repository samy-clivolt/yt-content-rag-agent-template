import { createTool } from '@mastra/core';
import { z } from 'zod';
import pkg from 'pg';
const { Client } = pkg;

export const youtubeIndexedVideosTool = createTool({
  id: 'youtube-indexed-videos',
  description: 'List all indexed YouTube videos with their metadata and filtering options',
  inputSchema: z.object({
    indexName: z.string().optional().describe('Filter by specific index name'),
    limit: z.number().optional().default(20).describe('Maximum number of results to return'),
    offset: z.number().optional().default(0).describe('Offset for pagination'),
    sortBy: z.enum(['indexed_at', 'last_updated', 'video_title', 'total_chapters'])
      .optional().default('indexed_at'),
    sortOrder: z.enum(['asc', 'desc']).optional().default('desc')
  }),
  outputSchema: z.object({
    videos: z.array(z.object({
      id: z.number(),
      videoUrl: z.string(),
      videoTitle: z.string().nullable(),
      totalChapters: z.number(),
      indexName: z.string().nullable(),
      indexedAt: z.string(),
      lastUpdated: z.string()
    })),
    totalCount: z.number(),
    pagination: z.object({
      limit: z.number(),
      offset: z.number(),
      hasMore: z.boolean()
    })
  }),
  execute: async ({ context }) => {
    const { indexName, limit = 20, offset = 0, sortBy = 'indexed_at', sortOrder = 'desc' } = context;
    
    const connectionString = process.env.POSTGRES_CONNECTION_STRING;
    if (!connectionString) {
      throw new Error('POSTGRES_CONNECTION_STRING is not set');
    }
    
    const pgClient = new Client({ connectionString });
    
    try {
      await pgClient.connect();
      
      // Build the query
      let whereClause = '';
      const queryParams: any[] = [];
      
      if (indexName) {
        whereClause = 'WHERE index_name = $1';
        queryParams.push(indexName);
      }
      
      // Get total count
      const countQuery = `
        SELECT COUNT(*) as count 
        FROM yt_rag.indexed_videos
        ${whereClause}
      `;
      const countResult = await pgClient.query(countQuery, queryParams);
      const totalCount = parseInt(countResult.rows[0].count);
      
      // Get videos with pagination
      const sortColumn = sortBy === 'indexed_at' ? 'indexed_at' :
                        sortBy === 'last_updated' ? 'last_updated' :
                        sortBy === 'video_title' ? 'video_title' :
                        'total_chapters';
      
      const videosQuery = `
        SELECT 
          id,
          video_url,
          video_title,
          total_chapters,
          index_name,
          indexed_at,
          last_updated
        FROM yt_rag.indexed_videos
        ${whereClause}
        ORDER BY ${sortColumn} ${sortOrder.toUpperCase()}
        LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
      `;
      
      queryParams.push(limit, offset);
      const videosResult = await pgClient.query(videosQuery, queryParams);
      
      // Format results
      const videos = videosResult.rows.map(row => ({
        id: row.id,
        videoUrl: row.video_url,
        videoTitle: row.video_title,
        totalChapters: row.total_chapters,
        indexName: row.index_name,
        indexedAt: row.indexed_at.toISOString(),
        lastUpdated: row.last_updated.toISOString()
      }));
      
      await pgClient.end();
      
      return {
        videos,
        totalCount,
        pagination: {
          limit,
          offset,
          hasMore: offset + limit < totalCount
        }
      };
      
    } catch (error) {
      await pgClient.end();
      throw error;
    }
  }
});