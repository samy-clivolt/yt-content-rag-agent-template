import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { ApifyClient } from 'apify-client';

interface TranscriptSegment {
  text: string;
  start: string;
  dur: string;
}

interface ApifyResult {
  data: TranscriptSegment[];
}

export const youtubeTranscriptTool = createTool({
  id: 'fetch-youtube-transcript',
  description: 'Fetch transcript from a YouTube video using Apify',
  inputSchema: z.object({
    videoUrl: z.string().url().describe('YouTube video URL'),
  }),
  outputSchema: z.object({
    transcript: z.array(z.object({
      text: z.string(),
      start: z.string(),
      duration: z.string(),
    })),
    fullText: z.string(),
  }),
  execute: async ({ context }) => {
    const apiToken = process.env.APIFY_API_TOKEN;
    if (!apiToken) {
      throw new Error('APIFY_API_TOKEN environment variable is not set');
    }
    return await fetchYoutubeTranscript(context.videoUrl, apiToken);
  },
});

const fetchYoutubeTranscript = async (videoUrl: string, apiToken: string) => {
  // Initialize the ApifyClient with API token
  const client = new ApifyClient({
    token: apiToken,
  });

  // Prepare Actor input
  const input = {
    videoUrl: videoUrl,
  };

  try {
    // Run the Actor and wait for it to finish
    const run = await client.actor("faVsWy9VTSNVIhWpR").call(input);

    // Fetch Actor results from the run's dataset
    const { items } = await client.dataset(run.defaultDatasetId).listItems();
    
    if (!items || items.length === 0) {
      throw new Error('No transcript data found');
    }

    const result = items[0] as unknown as ApifyResult;
    
    // Combine all transcript segments into full text
    const fullText = result.data
      .map(segment => segment.text)
      .join(' ');

    return {
      transcript: result.data.map(segment => ({
        text: segment.text,
        start: segment.start,
        duration: segment.dur,
      })),
      fullText: fullText,
    };
  } catch (error) {
    throw new Error(`Failed to fetch YouTube transcript: ${error instanceof Error ? error.message : String(error)}`);
  }
};