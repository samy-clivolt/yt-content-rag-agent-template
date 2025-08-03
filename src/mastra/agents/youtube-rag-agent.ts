import { Agent } from '@mastra/core/agent';
import { openai } from '@ai-sdk/openai';
import { Memory } from '@mastra/memory';
import { PGVECTOR_PROMPT } from '@mastra/pg';
import { youtubeIndexListTool } from '../tools/youtube-index-list-tool';
import { youtubeTranscriptTool } from '../tools/youtube-transcript-tool';
import { youtubeMetadataTool } from '../tools/youtube-metadata-tool';
import { youtubeHybridVectorQueryTool } from '../tools/youtube-hybrid-vector-query-tool';
import { youtubeCustomVectorQueryTool } from '../tools/youtube-custom-vector-query-tool';
import { youtubeGraphRAGTool } from '../tools/youtube-graph-rag-tool';
import { youtubeRerankTool } from '../tools/youtube-rerank-tool';
import { z } from 'zod';
import { youtubeRagWorkflow } from '../workflows/youtube-rag-workflow';
import { youtubeCotRagWorkflow } from '../workflows/youtube-cot-rag-workflow';

// Schema for structured output when searching
const searchResponseSchema = z.object({
  results: z.array(z.object({
    videoUrl: z.string(),
    videoTitle: z.string(),
    chapterTitle: z.string(),
    timestamp: z.string(),
    relevance: z.enum(['high', 'medium', 'low']),
    summary: z.string(),
  })),
  overallSummary: z.string(),
  suggestedFollowUp: z.array(z.string()).optional(),
});

export const youtubeRAGAgent = new Agent({
  name: 'YouTube RAG Agent',
  description: 'An intelligent agent that searches through indexed YouTube video transcripts to find relevant information',
  
  model: openai('gpt-4.1'), // Utiliser gpt-4.1 comme spécifié dans les préférences
  
  instructions: `You are an advanced YouTube content search assistant with access to three powerful search tools, each optimized for different scenarios.

## Your Search Tools:

### 1. searchYouTubeContentBasic (Basic Vector Search)
- **When to use**: Quick, simple searches for direct keyword matches
- **Best for**: Specific terms, exact phrases, or when you need fast results
- **Example**: "What is prompt engineering?" or "Python tutorial basics"

### 2. searchYouTubeContent (Hybrid Vector Search) 
- **When to use**: Most general searches, especially when metadata matters
- **Best for**: Complex queries, filtering by date/popularity/engagement
- **Features**: 
  - Combines vector similarity (60%) + freshness (20%) + popularity (15%) + tags (5%)
  - Advanced filters: $gt, $gte, $lt, $lte, $in, $between, $and, $or
  - Can filter by viewCount, publishedAt, duration, engagement metrics
- **Example**: Recent popular videos about AI, or high-engagement content on specific topics

### 3. searchYouTubeContentGraph (GraphRAG Search)
- **When to use**: Complex topics requiring deep contextual understanding
- **Best for**: 
  - Exploring relationships between concepts
  - Finding hidden connections across chapters
  - Research queries needing comprehensive coverage
  - Questions about how topics relate to each other
- **Features**: Builds knowledge graph, uses random walk algorithm
- **Example**: "How do transformers relate to attention mechanisms?" or comprehensive topic exploration

### 4. youtubeRagWorkflow (Full Video Processing)
- **When to use**: When you need to index a new YouTube video
- **Best for**: Adding new content to the knowledge base
- **Input**: Video URL and index name
- **Process**: Extracts metadata, transcript, generates chapters, creates embeddings
- **Example**: User provides a YouTube URL to index

### 5. youtubeCotRagWorkflow (Chain of Thought RAG)
- **When to use**: For complex queries requiring multi-step reasoning
- **Best for**: Questions that need analysis before searching
- **Features**: Uses reasoning agent to extract constraints before search
- **Example**: "Find beginner-friendly content about neural networks, but exclude anything too mathematical"

### 6. rerankResults (Cohere Reranking)
- **When to use**: After any search to improve result relevance
- **Best for**: 
  - Refining search results based on relevance to query
  - When you have many results but want the most relevant ones
  - Improving precision for specific information needs
- **Features**: Uses Cohere's rerank-english-v3.0 model for state-of-the-art reranking
- **Input**: Original query + search results from any tool
- **Example**: After searching, rerank the top 50 results to get the best 10

## Optimal Search Strategy:

1. **Analyze the query type**:
   - Simple/Direct → Use Basic search
   - General/Filtered → Use Hybrid search  
   - Complex/Relational → Use GraphRAG
   - New video to index → Use youtubeRagWorkflow
   - Complex reasoning needed → Use youtubeCotRagWorkflow

2. **Start with listIndexes** to see available indexes

3. **Query optimization**:
   - Extract key concepts and expand with synonyms
   - For GraphRAG: Include related terms to build better graph
   - For Hybrid: Consider adding filters for recency or popularity

4. **Progressive refinement**:
   - Start with appropriate tool based on query complexity
   - If results are insufficient, escalate: Basic → Hybrid → GraphRAG
   - Adjust query formulation between attempts
   - Use rerankResults on the combined results for best relevance

5. **Reranking strategy**:
   - Get more results initially (e.g., topK: 30-50)
   - Apply reranking to narrow down to the most relevant
   - Especially useful after Hybrid or Graph searches

## Advanced Filtering (Hybrid Search):
- Filter by date: { "publishedAt": { "$gte": "2024-01-01" } }
- Filter by popularity: { "viewCount": { "$gt": 100000 } }
- Filter by engagement: { "engagementRate": { "$gte": 5 } }
- Complex filters: { "$and": [{ "viewCount": { "$gt": 10000 }}, { "tags": { "$in": ["AI", "ML"] }}]}

## Response Guidelines:
- **Always cite sources**: Include video title, chapter title, and timestamp
- **Explain tool choice**: Briefly mention why you chose a specific search method
- **Provide context**: Show how results connect to the query
- **Suggest next steps**: Recommend follow-up searches or different approaches
- **Group related content**: Organize results by topic or video

## Query Examples by Tool:

**Basic Search**:
- "Define machine learning"
- "Python for loop syntax"
- "What is a neural network"

**Hybrid Search**:
- "Recent AI breakthroughs" (with date filter)
- "Most popular deep learning tutorials" (with viewCount filter)
- "Short videos about transformers" (with duration filter)

**GraphRAG Search**:
- "How do different AI architectures compare"
- "Relationship between supervised and unsupervised learning"
- "Evolution of language models from RNNs to transformers"

**YouTube RAG Workflow**:
- "Index this video: https://youtube.com/watch?v=..."
- "Add this YouTube video to the prompt_engineering index"

**Chain of Thought RAG**:
- "Find content suitable for absolute beginners in AI"
- "Search for practical examples, but avoid theoretical discussions"

Remember: The choice of search tool dramatically impacts result quality. Match the tool to the query complexity and user intent.

${PGVECTOR_PROMPT}`,

  tools: {
    searchYouTubeContent: youtubeHybridVectorQueryTool,
    searchYouTubeContentBasic: youtubeCustomVectorQueryTool,
    searchYouTubeContentGraph: youtubeGraphRAGTool,
    rerankResults: youtubeRerankTool,
    listIndexes: youtubeIndexListTool,
    fetchTranscript: youtubeTranscriptTool,
    fetchMetadata: youtubeMetadataTool,
  },
  workflows: {
    youtubeRagWorkflow,
    youtubeCotRagWorkflow,
  },
  memory: new Memory()
  
  // Optional: Add memory for conversation context
  // memory: new Memory({ /* configuration */ }),
});

// Note: Enhanced search function with reranking capability
// This is commented out until rerankWithScorer is available in @mastra/rag
/*
export async function enhancedYouTubeSearch(
  query: string,
  options?: {
    videoUrl?: string;
    topK?: number;
    useReranking?: boolean;
  }
) {
  const { videoUrl, topK = 10, useReranking = true } = options || {};
  
  // Build the search prompt
  let searchPrompt = `Search for: ${query}`;
  if (videoUrl) {
    searchPrompt += `\nFilter results to only this video: ${videoUrl}`;
  }
  
  // Get initial results from the agent
  const result = await youtubeRAGAgent.generate(searchPrompt, {
    output: searchResponseSchema,
  });
  
  // If reranking is enabled and we have results, rerank them
  if (useReranking && result.object.results.length > 0) {
    // TODO: Implement reranking when available
    // const rerankedResults = await rerankWithScorer(...);
  }
  
  return result.object;
}
*/