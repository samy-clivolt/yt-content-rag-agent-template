import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { google } from 'googleapis';

// Extract video ID from various YouTube URL formats
const extractVideoId = (url: string): string | null => {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([^&\n?#]+)/,
    /^([a-zA-Z0-9_-]{11})$/
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
};

export const youtubeMetadataTool = createTool({
  id: 'fetch-youtube-metadata',
  description: 'Fetch metadata (title, description, channel, duration, etc.) for a YouTube video using the YouTube Data API',
  inputSchema: z.object({
    videoUrl: z.string().describe('YouTube video URL or video ID'),
  }),
  outputSchema: z.object({
    videoId: z.string(),
    title: z.string(),
    description: z.string(),
    channelTitle: z.string(),
    channelId: z.string(),
    publishedAt: z.string(),
    duration: z.string().describe('ISO 8601 duration format'),
    viewCount: z.string().nullish(),
    likeCount: z.string().nullish(),
    commentCount: z.string().nullish(),
    tags: z.array(z.string()).optional(),
    thumbnails: z.object({
      default: z.object({ 
        url: z.string().nullish(), 
        width: z.number().nullish(), 
        height: z.number().nullish() 
      }).nullish(),
      medium: z.object({ 
        url: z.string().nullish(), 
        width: z.number().nullish(), 
        height: z.number().nullish() 
      }).nullish(),
      high: z.object({ 
        url: z.string().nullish(), 
        width: z.number().nullish(), 
        height: z.number().nullish() 
      }).nullish(),
      standard: z.object({ 
        url: z.string().nullish(), 
        width: z.number().nullish(), 
        height: z.number().nullish() 
      }).nullish(),
      maxres: z.object({ 
        url: z.string().nullish(), 
        width: z.number().nullish(), 
        height: z.number().nullish() 
      }).nullish(),
    }),
  }),
  execute: async ({ context }) => {
    const { videoUrl } = context;
    
    // Check for YouTube API key
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) {
      throw new Error('YOUTUBE_API_KEY environment variable is not set');
    }
    
    // Extract video ID from URL
    const videoId = extractVideoId(videoUrl);
    if (!videoId) {
      throw new Error(`Invalid YouTube URL or video ID: ${videoUrl}`);
    }
    
    // Initialize YouTube API client
    const youtube = google.youtube({
      version: 'v3',
      auth: apiKey,
    });
    
    try {
      // Fetch video details
      const response = await youtube.videos.list({
        part: ['snippet', 'contentDetails', 'statistics'],
        id: [videoId],
      });
      
      if (!response.data.items || response.data.items.length === 0) {
        throw new Error(`Video not found: ${videoId}`);
      }
      
      const video = response.data.items[0];
      const snippet = video.snippet!;
      const contentDetails = video.contentDetails!;
      const statistics = video.statistics;
      
      return {
        videoId: video.id!,
        title: snippet.title!,
        description: snippet.description!,
        channelTitle: snippet.channelTitle!,
        channelId: snippet.channelId!,
        publishedAt: snippet.publishedAt!,
        duration: contentDetails.duration!,
        viewCount: statistics?.viewCount || undefined,
        likeCount: statistics?.likeCount || undefined,
        commentCount: statistics?.commentCount || undefined,
        tags: snippet.tags || undefined,
        thumbnails: {
          default: snippet.thumbnails?.default,
          medium: snippet.thumbnails?.medium,
          high: snippet.thumbnails?.high,
          standard: snippet.thumbnails?.standard,
          maxres: snippet.thumbnails?.maxres,
        },
      };
    } catch (error) {
      throw new Error(`Failed to fetch YouTube metadata: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
});