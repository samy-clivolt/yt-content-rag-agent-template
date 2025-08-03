/**
 * YouTube Search Presets Tool
 * 
 * Pre-configured search strategies for common YouTube content discovery patterns.
 * Each preset optimizes for specific use cases with tailored filters and weights.
 */

import { youtubeHybridVectorQueryTool } from './youtube-hybrid-vector-query-tool';

/**
 * Search for recently trending videos
 * Focuses on recent uploads with high view counts
 */
export async function searchTrendingVideos(
  query: string,
  options: {
    indexName: string;
    topK?: number;
    days?: number;
    minViews?: number;
    runtimeContext?: any;
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
      includeScore: true,
      filter: {
        viewCount: { $gte: minViews }
      },
      scoringWeights: {
        vector: 0.4,
        freshness: 0.3,
        popularity: 0.25,
        tags: 0.05
      }
    },
    runtimeContext
  });
}

/**
 * Search for educational content
 * Prioritizes longer videos with high engagement
 */
export async function searchEducationalContent(
  query: string,
  options: {
    indexName: string;
    topK?: number;
    minEngagementRate?: number;
    runtimeContext?: any;
  }
) {
  const { indexName, topK = 10, minEngagementRate = 5, runtimeContext } = options;
  
  return youtubeHybridVectorQueryTool.execute({
    context: {
      queryText: query,
      indexName,
      topK,
      includeScore: true,
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
    runtimeContext
  });
}

/**
 * Search for quick tips and tricks
 * Targets short, focused content
 */
export async function searchQuickTips(
  query: string,
  options: {
    indexName: string;
    topK?: number;
    maxDurationSeconds?: number;
    runtimeContext?: any;
  }
) {
  const { indexName, topK = 10, maxDurationSeconds = 120, runtimeContext } = options;
  
  return youtubeHybridVectorQueryTool.execute({
    context: {
      queryText: query,
      indexName,
      topK,
      includeScore: true,
      filter: {
        chapterDurationSeconds: { $lte: maxDurationSeconds }
      },
      scoringWeights: {
        vector: 0.7,
        freshness: 0.05,
        popularity: 0.2,
        tags: 0.05
      }
    },
    runtimeContext
  });
}

/**
 * Search by specific tags
 * Finds videos with exact tag matches
 */
export async function searchByTags(
  query: string,
  options: {
    indexName: string;
    topK?: number;
    tags: string[];
    runtimeContext?: any;
  }
) {
  const { indexName, topK = 10, tags, runtimeContext } = options;
  
  return youtubeHybridVectorQueryTool.execute({
    context: {
      queryText: query,
      indexName,
      topK,
      includeScore: true,
      filter: {
        tags: { $in: tags }
      },
      scoringWeights: {
        vector: 0.5,
        freshness: 0.1,
        popularity: 0.2,
        tags: 0.2
      }
    },
    runtimeContext
  });
}

/**
 * Search within a specific channel
 * Restricts results to videos from one channel
 */
export async function searchChannelContent(
  query: string,
  options: {
    indexName: string;
    topK?: number;
    channelId: string;
    runtimeContext?: any;
  }
) {
  const { indexName, topK = 10, channelId, runtimeContext } = options;
  
  return youtubeHybridVectorQueryTool.execute({
    context: {
      queryText: query,
      indexName,
      topK,
      includeScore: true,
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
    runtimeContext
  });
}

/**
 * Search for in-depth content
 * Targets longer, comprehensive videos
 */
export async function searchInDepthContent(
  query: string,
  options: {
    indexName: string;
    topK?: number;
    minDurationMinutes?: number;
    runtimeContext?: any;
  }
) {
  const { indexName, topK = 10, minDurationMinutes = 20, runtimeContext } = options;
  
  return youtubeHybridVectorQueryTool.execute({
    context: {
      queryText: query,
      indexName,
      topK,
      includeScore: true,
      filter: {
        videoLengthMinutes: { $gte: minDurationMinutes }
      },
      scoringWeights: {
        vector: 0.8,
        freshness: 0.05,
        popularity: 0.1,
        tags: 0.05
      }
    },
    runtimeContext
  });
}

/**
 * Search for viral content
 * Prioritizes high view count and engagement
 */
export async function searchViralContent(
  query: string,
  options: {
    indexName: string;
    topK?: number;
    minViews?: number;
    minEngagementRate?: number;
    runtimeContext?: any;
  }
) {
  const { indexName, topK = 10, minViews = 100000, minEngagementRate = 10, runtimeContext } = options;
  
  return youtubeHybridVectorQueryTool.execute({
    context: {
      queryText: query,
      indexName,
      topK,
      includeScore: true,
      filter: {
        viewCount: { $gte: minViews },
        engagementRate: { $gte: minEngagementRate }
      },
      scoringWeights: {
        vector: 0.5,
        freshness: 0.05,
        popularity: 0.4,
        tags: 0.05
      }
    },
    runtimeContext
  });
}

/**
 * Search for recent updates
 * Finds fresh content on a topic
 */
export async function searchRecentUpdates(
  query: string,
  options: {
    indexName: string;
    topK?: number;
    days?: number;
    minViews?: number;
    maxLengthMinutes?: number;
    runtimeContext?: any;
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
      includeScore: true,
      filter: {
        viewCount: { $gte: minViews }
      },
      scoringWeights: {
        vector: 0.5,
        freshness: 0.35,
        popularity: 0.1,
        tags: 0.05
      }
    },
    runtimeContext
  });
}

/**
 * Custom preset search
 * Allows full customization of search parameters
 */
export async function searchWithCustomPreset(
  query: string,
  options: {
    indexName: string;
    topK?: number;
    filters?: Record<string, any>;
    scoringWeights?: {
      vector?: number;
      freshness?: number;
      popularity?: number;
      tags?: number;
    };
    runtimeContext?: any;
  }
) {
  const { 
    indexName, 
    topK = 10, 
    filters = {}, 
    scoringWeights = { vector: 0.6, freshness: 0.2, popularity: 0.15, tags: 0.05 },
    runtimeContext 
  } = options;
  
  // Ensure all weights are defined
  const completeWeights = {
    vector: scoringWeights.vector || 0.6,
    freshness: scoringWeights.freshness || 0.2,
    popularity: scoringWeights.popularity || 0.15,
    tags: scoringWeights.tags || 0.05
  };
  
  return youtubeHybridVectorQueryTool.execute({
    context: {
      queryText: query,
      indexName,
      topK,
      includeScore: true,
      filter: filters,
      scoringWeights: completeWeights
    },
    runtimeContext
  });
}

// Export all preset functions
export const youtubeSearchPresets = {
  trending: searchTrendingVideos,
  educational: searchEducationalContent,
  quickTips: searchQuickTips,
  byTags: searchByTags,
  channel: searchChannelContent,
  inDepth: searchInDepthContent,
  viral: searchViralContent,
  recent: searchRecentUpdates,
  custom: searchWithCustomPreset
};