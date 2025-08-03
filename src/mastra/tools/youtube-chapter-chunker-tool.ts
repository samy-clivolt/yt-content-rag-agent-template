import { createTool } from '@mastra/core/tools';
import { MDocument } from '@mastra/rag';
import { z } from 'zod';
import { openai } from '@ai-sdk/openai';

// Schema for chunking configuration
const chunkingConfigSchema = z.object({
  threshold: z.number().min(100).default(300).describe('Minimum characters to trigger chunking'),
  size: z.number().min(100).default(250).describe('Target size for each chunk'),
  overlap: z.number().min(0).default(50).describe('Overlap between chunks'),
  extractKeywords: z.boolean().default(true).describe('Whether to extract keywords per chunk'),
  extractSummary: z.boolean().default(true).describe('Whether to extract summary per chunk'),
  llm: z.any().optional().describe('Language model for summary extraction'),
});

// Schema for input chapters
const chapterSchema = z.object({
  timestamp: z.string(),
  title: z.string(),
  startTime: z.number(),
  endTime: z.number(),
  transcript: z.string(),
  keywords: z.array(z.string()),
});

// Schema for output chunks
const chunkSchema = z.object({
  id: z.string(),
  chapterIndex: z.number(),
  chunkIndex: z.number(),
  timestamp: z.string(),
  title: z.string(),
  startTime: z.number(),
  endTime: z.number(),
  text: z.string(),
  keywords: z.array(z.string()),
  summary: z.string().optional(),
  metadata: z.object({
    videoTitle: z.string().optional(),
    chapterTitle: z.string(),
    isFullChapter: z.boolean(),
    totalChunksInChapter: z.number(),
    originalChapterLength: z.number(),
  }),
});

export const youtubeChapterChunkerTool = createTool({
  id: 'youtube-chapter-chunker',
  description: 'Transform YouTube chapters into chunks for vector storage, keeping one chunk per chapter to preserve context',
  inputSchema: z.object({
    videoTitle: z.string().optional().describe('Title of the YouTube video'),
    chapters: z.array(chapterSchema).describe('Array of enriched chapters from YouTube video'),
    config: chunkingConfigSchema.optional().describe('Chunking configuration'),
  }),
  outputSchema: z.object({
    chunks: z.array(chunkSchema).describe('Array of chunks with enriched metadata'),
    stats: z.object({
      totalChapters: z.number(),
      totalChunks: z.number(),
      chaptersChunked: z.number(),
      averageChunkSize: z.number(),
    }).describe('Chunking statistics'),
  }),
  execute: async ({ context }) => {
    const { videoTitle, chapters, config = {} } = context;
    const mergedConfig = chunkingConfigSchema.parse(config);
    const { extractKeywords, extractSummary, llm } = mergedConfig;

    const chunks: z.infer<typeof chunkSchema>[] = [];
    let totalTextLength = 0;

    // Create one chunk per chapter
    for (let chapterIndex = 0; chapterIndex < chapters.length; chapterIndex++) {
      const chapter = chapters[chapterIndex];
      const chapterLength = chapter.transcript.length;
      
      // Create a URL-safe ID from the chapter title
      const slugifiedTitle = chapter.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .substring(0, 50); // Limit length
      
      // Extract additional metadata if enabled
      let additionalKeywords: string[] = [];
      let summary: string | undefined;
      
      // Extract metadata if enabled  
      if ((extractKeywords || extractSummary) && chapterLength > 100) {
        const doc = MDocument.fromText(chapter.transcript);
        const extractParams: any = {};
        
        if (extractKeywords) {
          extractParams.keywords = true;
        }
        
        if (extractSummary) {
          extractParams.summary = {
            summaries: ['self'],
            promptTemplate: "Summarize this text in 150 characters or less: {context}",
            llm: llm || openai('gpt-4.1-nano')
          };
          console.log(`Extracting summary for chapter ${chapterIndex}: "${chapter.title}"`);
        }
        
        const extracted = await doc.extractMetadata(extractParams);
        const metadata = extracted.getMetadata()[0];
        
        if (metadata) {
          additionalKeywords = metadata.keywords || [];
          summary = metadata.sectionSummary;
          if (extractSummary) {
            console.log(`Extracted summary for chapter ${chapterIndex}:`, summary);
          }
        }
      }

      chunks.push({
        id: `${slugifiedTitle}-${chapterIndex}`,
        chapterIndex,
        chunkIndex: 0,
        timestamp: chapter.timestamp,
        title: chapter.title,
        startTime: chapter.startTime,
        endTime: chapter.endTime,
        text: chapter.transcript,
        keywords: [
          ...chapter.keywords,
          ...additionalKeywords
        ].filter((k, i, arr) => arr.indexOf(k) === i), // Remove duplicates
        summary,
        metadata: {
          videoTitle: videoTitle || 'Unknown Video',
          chapterTitle: chapter.title,
          isFullChapter: true,
          totalChunksInChapter: 1,
          originalChapterLength: chapterLength,
        },
      });
      totalTextLength += chapterLength;
    }

    // Calculate statistics
    const stats = {
      totalChapters: chapters.length,
      totalChunks: chunks.length,
      chaptersChunked: 0, // No chapters are chunked since we keep one chunk per chapter
      averageChunkSize: Math.round(totalTextLength / chunks.length),
    };

    return {
      chunks,
      stats,
    };
  },
});