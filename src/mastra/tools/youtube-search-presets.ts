import { youtubeHybridVectorQueryTool } from './youtube-hybrid-vector-query-tool';
import { RuntimeContext } from '@mastra/core/runtime-context';

export interface SearchPresetOptions {
  indexName: string;
  topK?: number;
  runtimeContext?: RuntimeContext;
}

/**
 * Search for recent and popular content
 * @param query The search query
 * @param days Number of days to look back (default: 30)
 * @param minViews Minimum view count (default: 10000)
 */
export async function searchRecentPopular(
  query: string,
  options: SearchPresetOptions & {
    days?: number;
    minViews?: number;
  }
) {
  const { indexName, topK = 10, days = 30, minViews = 10000, runtimeContext } = options;
  
  const dateThreshold = new Date();
  dateThreshold.setDate(dateThreshold.getDate() - days);
  
  return youtubeHybridVectorQueryTool.execute({
    context: {
      queryText: query,
      indexName,
      topK,
      filter: {
        $and: [
          { publishedAt: { $gte: dateThreshold.toISOString() } },
          { viewCount: { $gte: minViews } }
        ]
      },
      scoringWeights: {
        vector: 0.5,
        freshness: 0.3,
        popularity: 0.15,
        tags: 0.05
      }
    },
    runtimeContext: runtimeContext || new RuntimeContext()
  });
}

/**
 * Search for content with high engagement
 * @param query The search query
 * @param minEngagementRate Minimum engagement rate percentage (default: 5)
 */
export async function searchByEngagement(
  query: string,
  options: SearchPresetOptions & {
    minEngagementRate?: number;
  }
) {
  const { indexName, topK = 10, minEngagementRate = 5, runtimeContext } = options;
  
  return youtubeHybridVectorQueryTool.execute({
    context: {
      queryText: query,
      indexName,
      topK,
      filter: {
        engagementRate: { $gte: minEngagementRate }
      },
      scoringWeights: {
        vector: 0.6,
        freshness: 0.1,
        popularity: 0.25,
        tags: 0.05
      }
    },
    runtimeContext: runtimeContext || new RuntimeContext()
  });
}

/**
 * Search for short chapters on a topic
 * @param query The search query
 * @param maxDurationSeconds Maximum chapter duration in seconds (default: 120)
 */
export async function searchShortChapters(
  query: string,
  options: SearchPresetOptions & {
    maxDurationSeconds?: number;
  }
) {
  const { indexName, topK = 10, maxDurationSeconds = 120, runtimeContext } = options;
  
  return youtubeHybridVectorQueryTool.execute({
    context: {
      queryText: query,
      indexName,
      topK,
      filter: {
        chapterDurationSeconds: { $lte: maxDurationSeconds }
      },
      scoringWeights: {
        vector: 0.7,
        freshness: 0.15,
        popularity: 0.1,
        tags: 0.05
      }
    },
    runtimeContext: runtimeContext || new RuntimeContext()
  });
}

/**
 * Search for content with specific tags
 * @param query The search query
 * @param tags Array of tags to match
 */
export async function searchByTags(
  query: string,
  options: SearchPresetOptions & {
    tags: string[];
  }
) {
  const { indexName, topK = 10, tags, runtimeContext } = options;
  
  return youtubeHybridVectorQueryTool.execute({
    context: {
      queryText: query,
      indexName,
      topK,
      filter: {
        tags: { $in: tags }
      },
      scoringWeights: {
        vector: 0.5,
        freshness: 0.15,
        popularity: 0.15,
        tags: 0.2
      }
    },
    runtimeContext: runtimeContext || new RuntimeContext()
  });
}

/**
 * Search for content from a specific channel
 * @param query The search query
 * @param channelId The YouTube channel ID
 */
export async function searchByChannel(
  query: string,
  options: SearchPresetOptions & {
    channelId: string;
  }
) {
  const { indexName, topK = 10, channelId, runtimeContext } = options;
  
  return youtubeHybridVectorQueryTool.execute({
    context: {
      queryText: query,
      indexName,
      topK,
      filter: {
        channelId: { $eq: channelId }
      },
      scoringWeights: {
        vector: 0.7,
        freshness: 0.15,
        popularity: 0.1,
        tags: 0.05
      }
    },
    runtimeContext: runtimeContext || new RuntimeContext()
  });
}

/**
 * Search for long-form content
 * @param query The search query
 * @param minDurationMinutes Minimum video duration in minutes (default: 20)
 */
export async function searchLongFormContent(
  query: string,
  options: SearchPresetOptions & {
    minDurationMinutes?: number;
  }
) {
  const { indexName, topK = 10, minDurationMinutes = 20, runtimeContext } = options;
  
  return youtubeHybridVectorQueryTool.execute({
    context: {
      queryText: query,
      indexName,
      topK,
      filter: {
        videoLengthMinutes: { $gte: minDurationMinutes }
      },
      scoringWeights: {
        vector: 0.65,
        freshness: 0.15,
        popularity: 0.15,
        tags: 0.05
      }
    },
    runtimeContext: runtimeContext || new RuntimeContext()
  });
}

/**
 * Search for trending content (high views and recent)
 * @param query The search query
 * @param days Number of days to look back (default: 7)
 * @param minViews Minimum view count (default: 50000)
 */
export async function searchTrending(
  query: string,
  options: SearchPresetOptions & {
    days?: number;
    minViews?: number;
  }
) {
  const { indexName, topK = 10, days = 7, minViews = 50000, runtimeContext } = options;
  
  const dateThreshold = new Date();
  dateThreshold.setDate(dateThreshold.getDate() - days);
  
  return youtubeHybridVectorQueryTool.execute({
    context: {
      queryText: query,
      indexName,
      topK,
      filter: {
        $and: [
          { publishedAt: { $gte: dateThreshold.toISOString() } },
          { viewCount: { $gte: minViews } }
        ]
      },
      scoringWeights: {
        vector: 0.4,
        freshness: 0.35,
        popularity: 0.2,
        tags: 0.05
      }
    },
    runtimeContext: runtimeContext || new RuntimeContext()
  });
}

/**
 * Complex search combining multiple criteria
 * @param query The search query
 * @param filters Custom filter object
 * @param scoringWeights Custom scoring weights
 */
export async function searchAdvanced(
  query: string,
  options: SearchPresetOptions & {
    filters: any;
    scoringWeights?: {
      vector?: number;
      freshness?: number;
      popularity?: number;
      tags?: number;
    };
  }
) {
  const { 
    indexName, 
    topK = 10, 
    filters, 
    scoringWeights = { vector: 0.6, freshness: 0.2, popularity: 0.15, tags: 0.05 },
    runtimeContext 
  } = options;
  
  return youtubeHybridVectorQueryTool.execute({
    context: {
      queryText: query,
      indexName,
      topK,
      filter: filters,
      scoringWeights
    },
    runtimeContext: runtimeContext || new RuntimeContext()
  });
}