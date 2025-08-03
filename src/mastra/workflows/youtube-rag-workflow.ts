import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { embedMany } from 'ai';
import { openai } from '@ai-sdk/openai';
import { PgVector } from '@mastra/pg';
import { youtubeTranscriptTool } from '../tools/youtube-transcript-tool';
import { youtubeMetadataTool } from '../tools/youtube-metadata-tool';
import { youtubeChapterChunkerTool } from '../tools/youtube-chapter-chunker-tool';
import { chapterGeneratorAgent } from '../agents/chapter-generator-agent';
import { seoKeywordAgent } from '../agents/seo-keyword-agent';
import { createHybridSearchIndexes, checkHybridIndexesExist } from '../utils/pgvector-index-optimizer';
import pkg from 'pg';
const { Client } = pkg;

// Helper function to convert seconds to MM:SS format
const formatTranscriptWithTimestamps = (transcript: Array<{ text: string; start: string; duration: string }>) => {
  return transcript.map(segment => {
    const totalSeconds = parseFloat(segment.start);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const timestamp = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    return { 
      timestamp, 
      text: segment.text,
      startSeconds: totalSeconds,
      endSeconds: totalSeconds + parseFloat(segment.duration)
    };
  });
};

// Helper function to convert MM:SS to seconds
const timestampToSeconds = (timestamp: string): number => {
  const [minutes, seconds] = timestamp.split(':').map(Number);
  return minutes * 60 + seconds;
};

// Helper function to convert ISO 8601 duration to seconds
const iso8601ToSeconds = (duration: string): number => {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  
  const hours = parseInt(match[1] || '0');
  const minutes = parseInt(match[2] || '0');
  const seconds = parseInt(match[3] || '0');
  
  return hours * 3600 + minutes * 60 + seconds;
};

// Schema for enriched chapters with transcripts
const enrichedChapterSchema = z.object({
  chapters: z.array(z.object({
    timestamp: z.string(),
    title: z.string(),
    startTime: z.number(),
    endTime: z.number(),
    transcript: z.string(),
    keywords: z.array(z.string())
  }))
});

// Step 1: Fetch video metadata
const fetchMetadata = createStep({
  id: 'fetch-metadata',
  inputSchema: z.object({
    videoUrl: z.string().url(),
    indexName: z.string()
  }),
  outputSchema: z.object({
    videoId: z.string(),
    title: z.string(),
    description: z.string(),
    channelTitle: z.string(),
    channelId: z.string(),
    publishedAt: z.string(),
    duration: z.string(),
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
  execute: async ({ inputData }) => {
    if (!youtubeMetadataTool.execute) {
      throw new Error('YouTube metadata tool execute function not found');
    }
    const result = await youtubeMetadataTool.execute({
      context: inputData
    } as any);
    return result;
  }
});

// Step 2: Fetch transcript
const fetchTranscript = createStep({
  id: 'fetch-transcript', 
  inputSchema: z.object({
    videoUrl: z.string().url()
  }),
  outputSchema: z.object({
    transcript: z.array(z.object({
      text: z.string(),
      start: z.string(),
      duration: z.string(),
    })),
    fullText: z.string(),
  }),
  execute: async ({ inputData }) => {
    if (!youtubeTranscriptTool.execute) {
      throw new Error('YouTube transcript tool execute function not found');
    }
    const result = await youtubeTranscriptTool.execute({
      context: inputData
    } as any);
    return result;
  }
});

// Step 3: Segment transcript into parts for parallel processing
const segmentTranscript = createStep({
  id: 'segment-transcript',
  inputSchema: z.object({
    transcript: z.array(z.object({
      text: z.string(),
      start: z.string(),
      duration: z.string()
    })),
    fullText: z.string()
  }),
  outputSchema: z.object({
    segments: z.array(z.object({
      segmentId: z.number(),
      transcript: z.array(z.object({
        text: z.string(),
        start: z.string(),
        duration: z.string()
      })),
      fullText: z.string(),
      startTime: z.number(),
      endTime: z.number()
    }))
  }),
  execute: async ({ inputData }) => {
    const { transcript, fullText } = inputData;
    const numSegments = 3;
    
    // Calculate total duration
    const lastSegment = transcript[transcript.length - 1];
    const totalDuration = parseFloat(lastSegment.start) + parseFloat(lastSegment.duration);
    const segmentDuration = totalDuration / numSegments;
    
    const segments = [];
    for (let i = 0; i < numSegments; i++) {
      const segmentStartTime = i * segmentDuration;
      const segmentEndTime = (i + 1) * segmentDuration;
      
      // Filter transcript segments that fall within this time range
      const segmentTranscript = transcript.filter(t => {
        const startTime = parseFloat(t.start);
        return startTime >= segmentStartTime && startTime < segmentEndTime;
      });
      
      // Get the text for this segment
      const segmentText = segmentTranscript
        .map(t => t.text)
        .join(' ')
        .trim();
      
      segments.push({
        segmentId: i + 1,
        transcript: segmentTranscript,
        fullText: segmentText,
        startTime: segmentStartTime,
        endTime: segmentEndTime
      });
    }
    
    return { segments };
  }
});

// Step 4: Generate keywords for a segment
const generateKeywordsForSegment = createStep({
  id: 'generate-keywords-for-segment',
  inputSchema: z.object({
    segmentId: z.number(),
    fullText: z.string()
  }),
  outputSchema: z.object({
    segmentId: z.number(),
    keywords: z.array(z.string())
  }),
  execute: async ({ inputData }) => {
    const keywordSchema = z.object({
      keywords: z.array(z.string()).min(3).max(10)
    });
    
    const result = await seoKeywordAgent.generate(
      [{ role: "user", content: `Extract SEO keywords from this transcript segment: ${inputData.fullText}` }],
      { 
        output: keywordSchema
      }
    );
    
    return {
      segmentId: inputData.segmentId,
      keywords: result.object.keywords
    };
  }
});

// Step 4 (original): Generate keywords using the agent with structured output
const generateKeywords = createStep({
  id: 'generate-keywords',
  inputSchema: z.object({
    fullText: z.string()
  }),
  outputSchema: z.object({
    keywords: z.array(z.string())
  }),
  execute: async ({ inputData }) => {
    const keywordSchema = z.object({
      keywords: z.array(z.string()).min(5).max(15)
    });
    
    const result = await seoKeywordAgent.generate(
      [{ role: "user", content: `Extract SEO keywords from this transcript: ${inputData.fullText}` }],
      { 
        output: keywordSchema
      }
    );
    
    return result.object;
  }
});

// Step 5: Generate chapters for a segment
const generateChaptersForSegment = createStep({
  id: 'generate-chapters-for-segment',
  inputSchema: z.object({
    segmentId: z.number(),
    transcript: z.array(z.object({
      text: z.string(),
      start: z.string(),
      duration: z.string()
    })),
    keywords: z.array(z.string())
  }),
  outputSchema: z.object({
    segmentId: z.number(),
    chapters: z.array(z.object({
      timestamp: z.string(),
      title: z.string()
    }))
  }),
  execute: async ({ inputData }) => {
    const { segmentId, transcript, keywords } = inputData;
    
    const formattedTranscript = formatTranscriptWithTimestamps(transcript);
    const transcriptText = formattedTranscript.map(s => `[${s.timestamp}] ${s.text}`).join('\n');
    
    const instructions = chapterGeneratorAgent.getInstructions();
    const prompt = (typeof instructions === 'string' ? instructions : await instructions)
      .replace('{{seo-keywords-to-hit}}', keywords.join(', '))
      .replace('{{transcript-with-timestamps}}', transcriptText);
    
    const chapterSchema = z.object({
      chapters: z.array(z.object({
        timestamp: z.string().regex(/^\d{2}:\d{2}$/),
        title: z.string()
      })).min(2).max(10) // Reduced min/max for segments
    });
    
    const result = await chapterGeneratorAgent.generate(
      [{ role: "user", content: prompt }],
      { 
        output: chapterSchema
      }
    );
    
    return {
      segmentId,
      chapters: result.object.chapters
    };
  }
});

// Step 5 (original): Generate chapters using the agent with structured output
const generateChapters = createStep({
  id: 'generate-chapters',
  inputSchema: z.object({
    transcript: z.array(z.object({
      text: z.string(),
      start: z.string(),
      duration: z.string()
    })),
    keywords: z.array(z.string())
  }),
  outputSchema: z.object({
    chapters: z.array(z.object({
      timestamp: z.string(),
      title: z.string()
    }))
  }),
  execute: async ({ inputData }) => {
    const { transcript, keywords } = inputData;
    
    const formattedTranscript = formatTranscriptWithTimestamps(transcript);
    const transcriptText = formattedTranscript.map(s => `[${s.timestamp}] ${s.text}`).join('\n');
    
    const instructions = chapterGeneratorAgent.getInstructions();
    const prompt = (typeof instructions === 'string' ? instructions : await instructions)
      .replace('{{seo-keywords-to-hit}}', keywords.join(', '))
      .replace('{{transcript-with-timestamps}}', transcriptText);
    
    const chapterSchema = z.object({
      chapters: z.array(z.object({
        timestamp: z.string().regex(/^\d{2}:\d{2}$/),
        title: z.string()
      })).min(5).max(20)
    });
    
    const result = await chapterGeneratorAgent.generate(
      [{ role: "user", content: prompt }],
      { 
        output: chapterSchema
      }
    );
    
    return result.object;
  }
});

// Schema for chunks
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

// Extended chunk schema with embedding
const chunkWithEmbeddingSchema = chunkSchema.extend({
  embedding: z.array(z.number()).optional()
});

// Step 6: Extract chapter transcripts for a segment
const extractChapterTranscriptsForSegment = createStep({
  id: 'extract-chapter-transcripts-for-segment',
  inputSchema: z.object({
    segmentId: z.number(),
    chapters: z.array(z.object({
      timestamp: z.string(),
      title: z.string()
    })),
    keywords: z.array(z.string()),
    transcript: z.array(z.object({
      text: z.string(),
      start: z.string(),
      duration: z.string()
    }))
  }),
  outputSchema: z.object({
    segmentId: z.number(),
    chapters: z.array(z.object({
      timestamp: z.string(),
      title: z.string(),
      startTime: z.number(),
      endTime: z.number(),
      transcript: z.string(),
      keywords: z.array(z.string())
    }))
  }),
  execute: async ({ inputData }) => {
    const { segmentId, chapters, keywords, transcript } = inputData;
    
    // Format transcript with timestamps
    const formattedTranscript = formatTranscriptWithTimestamps(transcript);
    
    // Enrich chapters with transcripts
    const enrichedChapters = chapters.map((chapter, index) => {
      const startTime = timestampToSeconds(chapter.timestamp);
      
      // Calculate end time (start of next chapter or end of segment)
      let endTime: number;
      if (index < chapters.length - 1) {
        endTime = timestampToSeconds(chapters[index + 1].timestamp);
      } else {
        // For the last chapter, use the end of the last transcript segment
        const lastSegment = formattedTranscript[formattedTranscript.length - 1];
        endTime = lastSegment.endSeconds;
      }
      
      // Extract transcript segments for this chapter
      const chapterSegments = formattedTranscript.filter(segment => 
        segment.startSeconds >= startTime && segment.startSeconds < endTime
      );
      
      // Combine segments into chapter transcript
      const chapterTranscript = chapterSegments
        .map(segment => segment.text)
        .join(' ')
        .trim();
      
      // Extract relevant keywords for this chapter
      const chapterKeywords = keywords.filter(keyword => 
        chapterTranscript.toLowerCase().includes(keyword.toLowerCase()) ||
        chapter.title.toLowerCase().includes(keyword.toLowerCase())
      );
      
      return {
        timestamp: chapter.timestamp,
        title: chapter.title,
        startTime,
        endTime,
        transcript: chapterTranscript,
        keywords: chapterKeywords
      };
    });
    
    return { 
      segmentId,
      chapters: enrichedChapters 
    };
  }
});

// Step 6 (original): Extract chapter transcripts
const extractChapterTranscripts = createStep({
  id: 'extract-chapter-transcripts',
  inputSchema: z.object({
    chapters: z.array(z.object({
      timestamp: z.string(),
      title: z.string()
    })),
    keywords: z.array(z.string()),
    transcript: z.array(z.object({
      text: z.string(),
      start: z.string(),
      duration: z.string()
    }))
  }),
  outputSchema: enrichedChapterSchema,
  execute: async ({ inputData }) => {
    const { chapters, keywords, transcript } = inputData;
    
    // Format transcript with timestamps
    const formattedTranscript = formatTranscriptWithTimestamps(transcript);
    
    // Enrich chapters with transcripts
    const enrichedChapters = chapters.map((chapter, index) => {
      const startTime = timestampToSeconds(chapter.timestamp);
      
      // Calculate end time (start of next chapter or end of video)
      let endTime: number;
      if (index < chapters.length - 1) {
        endTime = timestampToSeconds(chapters[index + 1].timestamp);
      } else {
        // For the last chapter, use the end of the last transcript segment
        const lastSegment = formattedTranscript[formattedTranscript.length - 1];
        endTime = lastSegment.endSeconds;
      }
      
      // Extract transcript segments for this chapter
      const chapterSegments = formattedTranscript.filter(segment => 
        segment.startSeconds >= startTime && segment.startSeconds < endTime
      );
      
      // Combine segments into chapter transcript
      const chapterTranscript = chapterSegments
        .map(segment => segment.text)
        .join(' ')
        .trim();
      
      // Extract relevant keywords for this chapter
      const chapterKeywords = keywords.filter(keyword => 
        chapterTranscript.toLowerCase().includes(keyword.toLowerCase()) ||
        chapter.title.toLowerCase().includes(keyword.toLowerCase())
      );
      
      return {
        timestamp: chapter.timestamp,
        title: chapter.title,
        startTime,
        endTime,
        transcript: chapterTranscript,
        keywords: chapterKeywords
      };
    });
    
    return { chapters: enrichedChapters };
  }
});

// Step 7: Merge segment results
const mergeSegmentResults = createStep({
  id: 'merge-segment-results',
  inputSchema: z.object({
    segmentResults: z.array(z.object({
      segmentId: z.number(),
      keywords: z.array(z.string()),
      chapters: z.array(z.object({
        timestamp: z.string(),
        title: z.string(),
        startTime: z.number(),
        endTime: z.number(),
        transcript: z.string(),
        keywords: z.array(z.string())
      }))
    }))
  }),
  outputSchema: z.object({
    keywords: z.array(z.string()),
    chapters: z.array(z.object({
      timestamp: z.string(),
      title: z.string(),
      startTime: z.number(),
      endTime: z.number(),
      transcript: z.string(),
      keywords: z.array(z.string())
    }))
  }),
  execute: async ({ inputData }) => {
    const { segmentResults } = inputData;
    
    // Sort segments by ID to ensure correct order
    const sortedResults = segmentResults.sort((a, b) => a.segmentId - b.segmentId);
    
    // Merge all keywords from all segments (remove duplicates)
    const allKeywords = sortedResults
      .flatMap(segment => segment.keywords)
      .filter((keyword, index, self) => self.indexOf(keyword) === index);
    
    // Merge all chapters from all segments in chronological order
    const allChapters = sortedResults
      .flatMap(segment => segment.chapters)
      .sort((a, b) => a.startTime - b.startTime);
    
    return {
      keywords: allKeywords,
      chapters: allChapters
    };
  }
});

// Schema for segment data
const segmentSchema = z.object({
  segmentId: z.number(),
  transcript: z.array(z.object({
    text: z.string(),
    start: z.string(),
    duration: z.string()
  })),
  fullText: z.string(),
  startTime: z.number(),
  endTime: z.number()
});

// Schema for segments array
const segmentsArraySchema = z.object({
  segments: z.array(segmentSchema)
});

// Process all segments - will receive the segments array
const processAllSegments = createStep({
  id: 'process-all-segments',
  inputSchema: segmentsArraySchema,
  outputSchema: z.object({
    segmentResults: z.array(z.object({
      segmentId: z.number(),
      keywords: z.array(z.string()),
      chapters: z.array(z.object({
        timestamp: z.string(),
        title: z.string(),
        startTime: z.number(),
        endTime: z.number(),
        transcript: z.string(),
        keywords: z.array(z.string())
      }))
    }))
  }),
  execute: async ({ inputData, mastra }) => {
    const { segments } = inputData;
    
    // Process each segment in parallel using Promise.all
    const results = await Promise.all(segments.map(async (segment) => {
      // Step 1: Generate keywords for segment
      const keywordsResult = await generateKeywordsForSegment.execute({ 
        inputData: { segmentId: segment.segmentId, fullText: segment.fullText },
        mastra 
      } as any);
      
      // Step 2: Generate chapters for segment
      const chaptersResult = await generateChaptersForSegment.execute({ 
        inputData: { 
          segmentId: segment.segmentId, 
          transcript: segment.transcript, 
          keywords: keywordsResult.keywords 
        },
        mastra 
      } as any);
      
      // Step 3: Extract chapter transcripts for segment
      const enrichedResult = await extractChapterTranscriptsForSegment.execute({ 
        inputData: { 
          segmentId: segment.segmentId,
          chapters: chaptersResult.chapters,
          keywords: keywordsResult.keywords,
          transcript: segment.transcript
        },
        mastra 
      } as any);
      
      return {
        segmentId: enrichedResult.segmentId,
        keywords: keywordsResult.keywords,
        chapters: enrichedResult.chapters
      };
    }));
    
    // Return results in expected format
    return {
      segmentResults: results
    };
  }
});


// Step 8: Chunk chapters using the chunker tool
const chunkChapters = createStep(youtubeChapterChunkerTool);

// Step 7: Generate embeddings and store in PgVector
const generateAndStoreEmbeddings = createStep({
  id: 'generate-and-store-embeddings',
  inputSchema: z.object({
    chunks: z.array(chunkSchema),
    videoUrl: z.string(),
    videoTitle: z.string(),
    indexName: z.string(),
    videoMetadata: z.object({
      videoId: z.string(),
      description: z.string(),
      channelTitle: z.string(),
      channelId: z.string(),
      publishedAt: z.string(),
      duration: z.string(),
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
      })
    })
  }),
  outputSchema: z.object({
    chunks: z.array(chunkSchema.extend({
      embedding: z.array(z.number()).optional()
    })),
    embeddingStats: z.object({
      totalEmbeddings: z.number(),
      indexName: z.string()
    })
  }),
  execute: async ({ inputData }) => {
    const { chunks, videoUrl, videoTitle, indexName, videoMetadata } = inputData;
    
    // Initialize PgVector
    const connectionString = process.env.POSTGRES_CONNECTION_STRING;
    if (!connectionString) {
      throw new Error('POSTGRES_CONNECTION_STRING is not set in environment variables');
    }
    
    const pgVector = new PgVector({ 
      connectionString,
      schemaName: 'yt_rag'
    });
    
    const EMBEDDING_DIMENSION = 1536;
    
    try {
      // Check if index exists, create if not
      const indexes = await pgVector.listIndexes();
      if (!indexes.includes(indexName)) {
        await pgVector.createIndex({
          indexName: indexName,
          dimension: EMBEDDING_DIMENSION,
          metric: 'cosine',
          indexConfig: {
            type: 'hnsw',
            hnsw: {
              m: 16,
              efConstruction: 64
            }
          }
        });
        console.log(`Created index: ${indexName}`);
        
        // Automatically create hybrid search indexes
        console.log(`Creating hybrid search indexes for optimal performance...`);
        await createHybridSearchIndexes(indexName, connectionString, 'yt_rag');
      } else {
        // Check if hybrid indexes exist, create them if not
        const hasHybridIndexes = await checkHybridIndexesExist(indexName, connectionString, 'yt_rag');
        if (!hasHybridIndexes) {
          console.log(`Hybrid search indexes not found for ${indexName}, creating them...`);
          await createHybridSearchIndexes(indexName, connectionString, 'yt_rag');
        }
      }
      
      // Prepare texts for embedding - combine multiple fields for richer context
      const textsToEmbed = chunks.map(chunk => 
        `${chunk.title}\n${chunk.summary || ''}\n${chunk.text}\nKeywords: ${chunk.keywords.join(', ')}`
      );
      
      // Generate embeddings for all chunks
      console.log(`Generating embeddings for ${chunks.length} chunks...`);
      const { embeddings } = await embedMany({
        model: openai.embedding('text-embedding-3-small'),
        values: textsToEmbed,
      });
      
      // Prepare metadata for each chunk
      const metadata = chunks.map((chunk) => {
        const viewCount = parseInt(videoMetadata.viewCount || '0');
        const likeCount = parseInt(videoMetadata.likeCount || '0');
        const commentCount = parseInt(videoMetadata.commentCount || '0');
        const durationSeconds = iso8601ToSeconds(videoMetadata.duration);
        const chapterDurationSeconds = chunk.endTime - chunk.startTime;
        
        // Calculate engagement metrics
        const engagementRate = viewCount > 0 ? Math.round((likeCount / viewCount) * 100 * 100) / 100 : 0;
        const commentRate = viewCount > 0 ? Math.round((commentCount / viewCount) * 100 * 100) / 100 : 0;
        
        // Combine all searchable keywords
        const searchKeywords = [
          ...chunk.keywords,
          ...(videoMetadata.tags || []),
          videoTitle,
          chunk.title
        ].filter((item, index, self) => self.indexOf(item) === index); // Remove duplicates
        
        return {
          // Core video metadata
          videoUrl,
          videoId: videoMetadata.videoId,
          videoTitle,
          videoDescription: videoMetadata.description,
          channelTitle: videoMetadata.channelTitle,
          channelId: videoMetadata.channelId,
          publishedAt: videoMetadata.publishedAt,
          duration: videoMetadata.duration,
          durationSeconds: Math.round(durationSeconds),
          videoLengthMinutes: Math.floor(durationSeconds / 60),
          viewCount,
          likeCount,
          commentCount,
          engagementRate,
          commentRate,
          tags: videoMetadata.tags || [],
          thumbnailUrl: videoMetadata.thumbnails.high?.url || videoMetadata.thumbnails.medium?.url || videoMetadata.thumbnails.default?.url,
          
          // Chapter/chunk specific metadata
          chapterTitle: chunk.title,
          chapterTimestamp: chunk.timestamp,
          chapterStartTime: Math.round(chunk.startTime),
          chapterEndTime: Math.round(chunk.endTime),
          chapterDurationSeconds: Math.round(chapterDurationSeconds),
          keywords: chunk.keywords,
          text: chunk.text,
          summary: chunk.summary,
          searchKeywords,
          
          // Indexing metadata
          indexedAt: new Date(),
          chapterIndex: chunk.chapterIndex,
          chunkIndex: chunk.chunkIndex,
          isFullChapter: chunk.metadata.isFullChapter
        };
      });
      
      // Prepare IDs for upsert (allows updating existing embeddings)
      const ids = chunks.map(chunk => chunk.id);
      
      // Upsert embeddings with metadata
      console.log(`Storing ${embeddings.length} embeddings...`);
      await pgVector.upsert({
        indexName: indexName,
        vectors: embeddings,
        metadata,
        ids
      });
      
      // Add embeddings to chunks (optional, for debugging/inspection)
      const chunksWithEmbeddings = chunks.map((chunk, index) => ({
        ...chunk,
        embedding: embeddings[index]
      }));
      
      // Don't disconnect here - let Mastra handle the connection lifecycle
      
      // Insert into indexed_videos table
      const pgClient = new Client({
        connectionString: connectionString,
      });
      
      try {
        await pgClient.connect();
        
        // Insert or update the indexed video record
        await pgClient.query(`
          INSERT INTO yt_rag.indexed_videos (video_url, video_title, total_chapters, index_name)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (video_url) 
          DO UPDATE SET 
            video_title = EXCLUDED.video_title,
            total_chapters = EXCLUDED.total_chapters,
            index_name = EXCLUDED.index_name,
            last_updated = CURRENT_TIMESTAMP
        `, [videoUrl, videoTitle, chunks.length, indexName]);
        
      } finally {
        await pgClient.end();
      }
      
      return {
        chunks: chunksWithEmbeddings,
        embeddingStats: {
          totalEmbeddings: embeddings.length,
          indexName: indexName
        }
      };
    } catch (error) {
      // Don't disconnect here - let Mastra handle the connection lifecycle
      throw error;
    }
  }
});

// Create the workflow
export const youtubeRagWorkflow = createWorkflow({
  id: 'youtube-rag-workflow',
  description: 'Generate YouTube chapters with transcripts for RAG system',
  inputSchema: z.object({
    videoUrl: z.string().url(),
    indexName: z.string()
      .min(1, "Index name is required")
      .regex(/^[a-z][a-z0-9_]*$/, "Index name must start with a letter and contain only lowercase letters, numbers, and underscores")
  }),
  outputSchema: z.object({
    videoUrl: z.string(),
    videoTitle: z.string(),
    videoDescription: z.string(),
    channelTitle: z.string(),
    publishedAt: z.string(),
    duration: z.string(),
    fullTranscript: z.string(),
    keywords: z.array(z.string()),
    chapters: z.array(z.object({
      timestamp: z.string(),
      title: z.string(),
      startTime: z.number(),
      endTime: z.number(),
      transcript: z.string(),
      keywords: z.array(z.string())
    })),
    chunks: z.array(chunkWithEmbeddingSchema),
    chunkingStats: z.object({
      totalChapters: z.number(),
      totalChunks: z.number(),
      chaptersChunked: z.number(),
      averageChunkSize: z.number(),
    }),
    embeddingStats: z.object({
      totalEmbeddings: z.number(),
      indexName: z.string()
    })
  })
})
  // Step 1: Fetch metadata
  .then(fetchMetadata)
  // Map metadata output back to videoUrl for transcript fetch
  .map(async ({ inputData, getInitData }) => ({
    videoUrl: getInitData().videoUrl
  }))
  // Step 2: Fetch transcript
  .then(fetchTranscript)
  // Step 3: Segment the transcript
  .map(async ({ inputData }) => ({
    transcript: inputData.transcript,
    fullText: inputData.fullText
  }))
  .then(segmentTranscript)
  // Step 4-6: Process all segments with internal parallelization
  .then(processAllSegments)
  // Step 7: Merge segment results (already in correct format)
  .then(mergeSegmentResults)
  // Step 8: Chunk the chapters - map data to tool input format
  .map(async ({ inputData, getStepResult }) => {
    const metadataData = getStepResult(fetchMetadata);
    return {
      videoTitle: metadataData.title,
      chapters: inputData.chapters,
      config: {
        threshold: 300,
        size: 250,
        overlap: 50,
        extractKeywords: true,
        extractSummary: true,
      },
    };
  })
  .then(chunkChapters)
  // Step 9: Generate embeddings and store in PgVector
  .map(async ({ inputData, getStepResult, getInitData }) => {
    const metadataData = getStepResult(fetchMetadata);
    return {
      chunks: inputData.chunks,
      videoUrl: getInitData().videoUrl,
      videoTitle: metadataData.title,
      indexName: getInitData().indexName,
      videoMetadata: {
        videoId: metadataData.videoId,
        description: metadataData.description,
        channelTitle: metadataData.channelTitle,
        channelId: metadataData.channelId,
        publishedAt: metadataData.publishedAt,
        duration: metadataData.duration,
        viewCount: metadataData.viewCount,
        likeCount: metadataData.likeCount,
        commentCount: metadataData.commentCount,
        tags: metadataData.tags,
        thumbnails: metadataData.thumbnails
      }
    };
  })
  .then(generateAndStoreEmbeddings)
  // Final mapping to output schema
  .map(async ({ inputData, getStepResult, getInitData }) => {
    const initData = getInitData();
    const metadataData = getStepResult(fetchMetadata);
    const transcriptData = getStepResult(fetchTranscript);
    const mergedData = getStepResult(mergeSegmentResults);
    const chunkingResult = getStepResult(chunkChapters);
    const embeddingResult = inputData;
    
    return {
      videoUrl: initData.videoUrl,
      videoTitle: metadataData.title,
      videoDescription: metadataData.description,
      channelTitle: metadataData.channelTitle,
      publishedAt: metadataData.publishedAt,
      duration: metadataData.duration,
      fullTranscript: transcriptData.fullText,
      keywords: mergedData.keywords,
      chapters: mergedData.chapters,
      chunks: embeddingResult.chunks,
      chunkingStats: chunkingResult.stats,
      embeddingStats: embeddingResult.embeddingStats
    };
  })
  .commit();