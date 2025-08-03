import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { youtubeTranscriptTool } from '../tools/youtube-transcript-tool';
import { chapterGeneratorAgent } from '../agents/chapter-generator-agent';
import { seoKeywordAgent } from '../agents/seo-keyword-agent';

// Helper function to convert seconds to MM:SS format
const formatTranscriptWithTimestamps = (transcript: Array<{ text: string; start: string; duration: string }>) => {
  return transcript.map(segment => {
    const totalSeconds = parseFloat(segment.start);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const timestamp = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    return `[${timestamp}] ${segment.text}`;
  }).join('\n');
};

// Schemas for structured outputs
const keywordSchema = {
  type: "object",
  properties: {
    keywords: { type: "array", items: { type: "string" }, minItems: 5, maxItems: 15 }
  },
  additionalProperties: false,
  required: ["keywords"]
};

const chapterSchema = {
  type: "object",
  properties: {
    chapters: {
      type: "array",
      items: {
        type: "object",
        properties: {
          timestamp: { type: "string", pattern: "^\\d{2}:\\d{2}$" },
          title: { type: "string" }
        },
        required: ["timestamp", "title"],
        additionalProperties: false
      },
      minItems: 5,
      maxItems: 20
    }
  },
  additionalProperties: false,
  required: ["chapters"]
};

// Step 1: Fetch transcript
const fetchTranscript = createStep(youtubeTranscriptTool);

// Step 2: Generate SEO keywords
const generateKeywords = createStep({
  id: 'generate-keywords',
  execute: async ({ inputData }) => {
    const { object } = await seoKeywordAgent.generate(
      [{ role: "user", content: `Extract SEO keywords from this transcript: ${inputData.fullText}` }],
      { output: keywordSchema }
    );
    return object;
  }
});

// Step 3: Generate chapters
const generateChapters = createStep({
  id: 'generate-chapters',
  execute: async ({ inputData, getStepResult }) => {
    const transcript = getStepResult(fetchTranscript);
    const { keywords } = inputData;
    
    const transcriptFormatted = formatTranscriptWithTimestamps(transcript.transcript);
    const prompt = chapterGeneratorAgent.getInstructions()
      .replace('{{seo-keywords-to-hit}}', keywords.join(', '))
      .replace('{{transcript-with-timestamps}}', transcriptFormatted);
    
    const { object } = await chapterGeneratorAgent.generate(
      [{ role: "user", content: prompt }],
      { output: chapterSchema }
    );
    return object;
  }
});

// Create the workflow
export const youtubeContentWorkflow = createWorkflow({
  id: 'youtube-content-workflow',
  description: 'Generate YouTube chapters from video transcript with SEO keywords',
  inputSchema: z.object({
    videoUrl: z.string().url()
  }),
  outputSchema: z.object({
    chapters: z.array(z.object({
      timestamp: z.string(),
      title: z.string()
    })),
    keywords: z.array(z.string())
  })
})
  .then(fetchTranscript)
  .then(generateKeywords)
  .then(generateChapters)
  .map(({ inputData, getStepResult }) => ({
    chapters: inputData.chapters,
    keywords: getStepResult(generateKeywords).keywords
  }))
  .commit();