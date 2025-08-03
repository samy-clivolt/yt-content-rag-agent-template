# YouTube Content RAG Agent

A Mastra-powered application that extracts, indexes, and provides intelligent search capabilities for YouTube video content using advanced RAG (Retrieval-Augmented Generation) techniques.

## Overview

This template demonstrates how to build a comprehensive YouTube content analysis and search system using Mastra's agent, workflow, and tool capabilities. It automatically extracts video transcripts, generates chapters with AI, and provides semantic search with multiple query strategies.

## Features

- 🎥 **YouTube Content Extraction**: Fetch metadata and transcripts from any YouTube video
- 🤖 **AI-Powered Chapter Generation**: Automatically create timestamped chapters using GPT-4.1
- 🔍 **Advanced Search Capabilities**: 
  - Semantic vector search with PgVector
  - Hybrid search combining vector and keyword matching
  - Graph-based search for discovering related content
- 📊 **Search Analytics**: Track and analyze search patterns
- 🛠️ **Index Management**: Tools for maintaining and optimizing vector indexes
- 🎯 **Smart Chunking**: Chapter-based chunking preserves context and improves search quality

## Prerequisites

- Node.js 18.0.0 or higher (20.9.0+ recommended)
- pnpm (recommended) or npm
- PostgreSQL 12+ with pgvector extension
- API Keys:
  - OpenAI API key (for embeddings)
  - YouTube Data API v3 key (for video metadata)
  - Apify API token (for transcript extraction)

## Quick Start

### 1. Clone and Install

```bash
git clone https://github.com/yourusername/yt-content-rag-agent.git
cd yt-content-rag-agent
pnpm install  # or npm install
```

### 2. Environment Setup

We provide automated setup scripts to simplify configuration:

```bash
# 1. Check prerequisites
pnpm run setup:check

# 2. Configure environment variables
pnpm run setup:env

# 3. Set up database
pnpm run setup:db
```

Or run all setup steps at once:

```bash
pnpm run setup
```

### 3. Database Setup (Manual)

**macOS:**
```bash
# Install pgvector
brew install pgvector

# Create database and enable extension
psql -U postgres -c "CREATE DATABASE yt_rag;"
psql -U postgres -d yt_rag -f scripts/setup-database.sql
```

**Windows:**
```bash
# Install PostgreSQL if not already installed
# Download from https://www.postgresql.org/download/windows/

# Install pgvector using pgxn
# First install pgxn client
curl -s -L https://github.com/pgxn/pgxn-client/raw/master/pgxn-install.py | python

# Install pgvector
pgxn install vector

# Or build from source
git clone https://github.com/pgvector/pgvector.git
cd pgvector
nmake /F Makefile.win
nmake /F Makefile.win install

# Create database
psql -U postgres -c "CREATE DATABASE yt_rag;"
psql -U postgres -d yt_rag -f scripts/setup-database.sql
```

**Linux (Ubuntu/Debian):**
```bash
# Install pgvector
sudo apt install postgresql-16-pgvector

# Create database
sudo -u postgres psql -c "CREATE DATABASE yt_rag;"
sudo -u postgres psql -d yt_rag -f scripts/setup-database.sql
```

### 4. Configure Environment (Manual)

If you prefer manual setup, copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Required environment variables:
- `POSTGRES_CONNECTION_STRING`: PostgreSQL connection with pgvector
- `OPENAI_API_KEY`: For embeddings ([Get your key](https://platform.openai.com/api-keys))
- `YOUTUBE_API_KEY`: For fetching video metadata (see instructions below)
- `APIFY_API_TOKEN`: For extracting transcripts ([Get your token](https://console.apify.com/account/integrations))

#### Getting a YouTube Data API Key

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the YouTube Data API v3:
   - Navigate to "APIs & Services" → "Library"
   - Search for "YouTube Data API v3"
   - Click on it and press "Enable"
4. Create credentials:
   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "API Key"
   - Copy your API key
5. (Optional) Restrict your API key:
   - Click on your API key
   - Under "API restrictions", select "Restrict key"
   - Select "YouTube Data API v3"
   - Save

#### Getting an Apify API Token

This template uses the [YouTube Transcript Scraper](https://console.apify.com/actors/faVsWy9VTSNVIhWpR/input) actor from Apify.

**Pricing**: $7 per 1000 transcript extractions

1. Create an account at [Apify](https://console.apify.com/sign-up)
2. Navigate to [Account → Integrations](https://console.apify.com/account/integrations)
3. Copy your API token
4. (Optional) Add credits to your account:
   - Go to [Billing](https://console.apify.com/billing)
   - Add a payment method
   - Purchase credits based on your usage needs


### 5. Additional Scripts

```bash
# Create hybrid search indexes
pnpm run setup:db:indexes

# Reset database (WARNING: deletes all data)
pnpm run db:reset
```

### 6. Start the Application

```bash
pnpm run dev
```

The Mastra server will start on http://localhost:4111 (configurable via PORT in .env)

## Architecture

### Agents

- **SEO Keyword Agent**: Generates contextual keywords for video content
- **Chapter Generator Agent**: Creates timestamped chapters from transcripts
- **YouTube RAG Agent**: Intelligent search agent with access to all query tools

### Tools

- **YouTube Metadata Tool**: Fetches video title, description, and metadata
- **YouTube Transcript Tool**: Extracts full video transcripts via Apify
- **Chapter Chunker Tool**: Creates optimized chunks based on AI-generated chapters
- **Vector Query Tools**: Multiple search strategies (semantic, hybrid, graph)
- **Index Management Tools**: List, maintain, and optimize indexes

### Workflows

- **YouTube RAG Workflow**: Main extraction pipeline (6 steps)
  1. Fetch video metadata
  2. Extract transcript
  3. Generate SEO keywords
  4. Create chapters with timestamps
  5. Enrich chapters with specific transcripts
  6. Chunk content for indexing

- **Content Workflow**: Alternative workflow for content analysis
- **Chain-of-Thought RAG Workflow**: Advanced reasoning for complex queries

## Usage Examples

### Extract and Process a Video

```typescript
import { mastra } from './src/mastra';

const result = await mastra.workflows.youtubeRagWorkflow.execute({
  input: { 
    videoUrl: 'https://youtube.com/watch?v=VIDEO_ID',
    indexName: 'my-youtube-index' // Optional: specify custom index name
  }
});

console.log(result.chapters); // AI-generated chapters with transcripts
```

### Search Indexed Content

```typescript
// Semantic search
const semanticResults = await mastra.tools.youtubeVectorQueryTool.execute({
  query: "machine learning concepts",
  topK: 5
});

// Hybrid search (vector + keyword)
const hybridResults = await mastra.tools.youtubeHybridVectorQueryTool.execute({
  query: "how to train neural networks",
  indexName: "yt_hybrid_index",
  topK: 10
});

// Graph-based discovery
const relatedContent = await mastra.tools.youtubeGraphRAGTool.execute({
  query: "deep learning",
  searchDepth: 2
});
```

### Use the RAG Agent

```typescript
const agent = mastra.agents.youtubeRAGAgent;

const response = await agent.generate(
  "Find information about transformers in the indexed videos"
);
```

## Database Schema

The application uses PostgreSQL with pgvector for semantic search. The database is organized in the `yt_rag` schema with the following tables:

### Core Tables
- **indexed_videos**: Tracks all processed YouTube videos
- **search_logs**: Analytics for search queries and results

### Vector Index Tables (created dynamically)
- **demo_videos**: Example video embeddings
- **mastra_lives**: Mastra Live stream embeddings
- **prompt_engineering**: Prompt engineering video embeddings
- Custom indexes can be created with any name

Each vector table contains:
- `id`: Primary key
- `vector_id`: Unique identifier for the chunk
- `embedding`: Vector representation (1536 dimensions)
- `metadata`: JSONB with video details, timestamps, and content

## Project Structure

```
yt-content-rag-agent/
├── src/
│   └── mastra/
│       ├── index.ts          # Main Mastra configuration
│       ├── agents/           # AI agents
│       ├── tools/            # Mastra tools
│       └── workflows/        # Processing workflows
├── scripts/                  # Setup and utility scripts
│   ├── check-requirements.js # Verify prerequisites
│   ├── setup-env.js         # Configure environment
│   ├── setup-database.js    # Database setup wrapper
│   ├── setup-database.sh    # Database creation script
│   ├── setup-database.sql   # Schema definitions
│   ├── reset-database.js    # Reset all data
│   └── create-all-hybrid-indexes.sh # Optimize search
├── .env.example             # Environment template
├── package.json
└── tsconfig.json
```

## Advanced Features

### Search Presets

Pre-configured search strategies for common use cases:
- Technical tutorials
- Educational content
- Product reviews
- News and updates

### Index Optimization

Automatic index optimization based on usage patterns:
- HNSW parameters tuning
- Query performance tracking
- Index size management

### Memory Storage

Optional persistent memory using LibSQL for:
- Agent conversation history
- Search analytics
- Performance metrics

## API Documentation

### Workflows

#### youtubeRagWorkflow
Extracts and processes YouTube videos into searchable chunks.

**Input:**
```typescript
{ videoUrl: string
  indexName?: string  // Optional: custom index name (default: 'yt-videos')
}
```

**Output:**
```typescript
{
  metadata: VideoMetadata,
  transcript: string,
  seoKeywords: string[],
  chapters: ChapterData[]
}
```

### Tools

See `src/mastra/tools/` for detailed tool documentation.

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see LICENSE file for details

## Acknowledgments

Built with [Mastra](https://mastra.ai) - The TypeScript AI framework