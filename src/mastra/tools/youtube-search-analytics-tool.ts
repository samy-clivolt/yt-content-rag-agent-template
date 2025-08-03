import { createTool } from '@mastra/core';
import { z } from 'zod';
import pkg from 'pg';
const { Client } = pkg;

export const youtubeSearchAnalyticsTool = createTool({
  id: 'youtube-search-analytics',
  description: 'Analyze search patterns and popular queries from the search logs',
  inputSchema: z.object({
    timeRange: z.enum(['last_hour', 'last_24h', 'last_week', 'last_month', 'all_time'])
      .optional().default('last_week'),
    groupBy: z.enum(['query', 'search_type', 'hour', 'day'])
      .optional().default('query'),
    limit: z.number().optional().default(10).describe('Top N results to return'),
    includeEmptySearches: z.boolean().optional().default(false)
      .describe('Include searches that returned 0 results')
  }),
  outputSchema: z.object({
    analytics: z.array(z.object({
      groupKey: z.string(),
      count: z.number(),
      avgResultsCount: z.number(),
      totalResultsReturned: z.number(),
      exampleQueries: z.array(z.string()).optional()
    })),
    summary: z.object({
      totalSearches: z.number(),
      uniqueQueries: z.number(),
      avgResultsPerSearch: z.number(),
      searchesWithNoResults: z.number(),
      timeRangeStart: z.string(),
      timeRangeEnd: z.string()
    })
  }),
  execute: async ({ context }) => {
    const { 
      timeRange = 'last_week', 
      groupBy = 'query', 
      limit = 10,
      includeEmptySearches = false 
    } = context;
    
    const connectionString = process.env.POSTGRES_CONNECTION_STRING;
    if (!connectionString) {
      throw new Error('POSTGRES_CONNECTION_STRING is not set');
    }
    
    const pgClient = new Client({ connectionString });
    
    try {
      await pgClient.connect();
      
      // Calculate time range
      let timeClause = '';
      let timeRangeStart = new Date(0);
      const timeRangeEnd = new Date();
      
      switch (timeRange) {
        case 'last_hour':
          timeRangeStart = new Date(Date.now() - 60 * 60 * 1000);
          timeClause = "WHERE searched_at >= NOW() - INTERVAL '1 hour'";
          break;
        case 'last_24h':
          timeRangeStart = new Date(Date.now() - 24 * 60 * 60 * 1000);
          timeClause = "WHERE searched_at >= NOW() - INTERVAL '24 hours'";
          break;
        case 'last_week':
          timeRangeStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          timeClause = "WHERE searched_at >= NOW() - INTERVAL '7 days'";
          break;
        case 'last_month':
          timeRangeStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
          timeClause = "WHERE searched_at >= NOW() - INTERVAL '30 days'";
          break;
        case 'all_time':
          timeClause = '';
          break;
      }
      
      // Add filter for empty searches if needed
      if (!includeEmptySearches) {
        timeClause += timeClause ? ' AND results_count > 0' : 'WHERE results_count > 0';
      }
      
      // Get summary statistics
      const summaryQuery = `
        SELECT 
          COUNT(*) as total_searches,
          COUNT(DISTINCT query) as unique_queries,
          AVG(results_count) as avg_results_per_search,
          COUNT(CASE WHEN results_count = 0 THEN 1 END) as searches_with_no_results
        FROM yt_rag.search_logs
        ${timeClause}
      `;
      const summaryResult = await pgClient.query(summaryQuery);
      const summary = summaryResult.rows[0];
      
      // Build group by query
      let groupByColumn = '';
      let groupBySelect = '';
      let orderByClause = 'ORDER BY count DESC';
      
      switch (groupBy) {
        case 'query':
          groupByColumn = 'query';
          groupBySelect = 'query as group_key';
          break;
        case 'search_type':
          groupByColumn = 'search_type';
          groupBySelect = 'COALESCE(search_type, \'unknown\') as group_key';
          break;
        case 'hour':
          groupByColumn = 'DATE_TRUNC(\'hour\', searched_at)';
          groupBySelect = 'TO_CHAR(DATE_TRUNC(\'hour\', searched_at), \'YYYY-MM-DD HH24:00\') as group_key';
          orderByClause = 'ORDER BY DATE_TRUNC(\'hour\', searched_at) DESC';
          break;
        case 'day':
          groupByColumn = 'DATE_TRUNC(\'day\', searched_at)';
          groupBySelect = 'TO_CHAR(DATE_TRUNC(\'day\', searched_at), \'YYYY-MM-DD\') as group_key';
          orderByClause = 'ORDER BY DATE_TRUNC(\'day\', searched_at) DESC';
          break;
      }
      
      // Get grouped analytics
      const analyticsQuery = `
        SELECT 
          ${groupBySelect},
          COUNT(*) as count,
          AVG(results_count) as avg_results_count,
          SUM(results_count) as total_results_returned
          ${groupBy === 'search_type' || groupBy === 'hour' || groupBy === 'day' ? 
            ', ARRAY_AGG(DISTINCT query ORDER BY searched_at DESC LIMIT 3) as example_queries' : ''}
        FROM yt_rag.search_logs
        ${timeClause}
        GROUP BY ${groupByColumn}
        ${orderByClause}
        LIMIT $1
      `;
      
      const analyticsResult = await pgClient.query(analyticsQuery, [limit]);
      
      // Format analytics results
      const analytics = analyticsResult.rows.map(row => ({
        groupKey: row.group_key,
        count: parseInt(row.count),
        avgResultsCount: parseFloat(row.avg_results_count),
        totalResultsReturned: parseInt(row.total_results_returned),
        ...(row.example_queries && { exampleQueries: row.example_queries })
      }));
      
      await pgClient.end();
      
      return {
        analytics,
        summary: {
          totalSearches: parseInt(summary.total_searches),
          uniqueQueries: parseInt(summary.unique_queries),
          avgResultsPerSearch: parseFloat(summary.avg_results_per_search) || 0,
          searchesWithNoResults: parseInt(summary.searches_with_no_results),
          timeRangeStart: timeRangeStart.toISOString(),
          timeRangeEnd: timeRangeEnd.toISOString()
        }
      };
      
    } catch (error) {
      await pgClient.end();
      throw error;
    }
  }
});