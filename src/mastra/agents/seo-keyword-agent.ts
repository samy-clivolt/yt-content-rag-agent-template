import { openai } from '@ai-sdk/openai';
import { Agent } from '@mastra/core/agent';

export const seoKeywordAgent = new Agent({
  name: 'SEO Keyword Agent',
  instructions: `Generate SEO keywords based on a YouTube video transcript. 
  Analyze the content and extract the most relevant keywords that would help with discoverability.
  Focus on technical terms, main topics, and trending keywords related to the content.`,
  model: openai('gpt-4.1'),
  tools: {},
});