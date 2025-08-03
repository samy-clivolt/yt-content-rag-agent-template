import { createTool } from '@mastra/core';
import { z } from 'zod';
import { PgVector } from '@mastra/pg';
import { embed } from 'ai';
import { openai } from '@ai-sdk/openai';

// GraphRAG types
interface GraphNode {
  id: string;
  content: string;
  embedding?: number[];
  metadata?: Record<string, any>;
}

interface RankedNode extends GraphNode {
  score: number;
}

interface GraphEdge {
  source: string;
  target: string;
  weight: number;
  type: 'semantic';
}

interface GraphChunk {
  text: string;
  metadata: Record<string, any>;
}

interface GraphEmbedding {
  vector: number[];
}

// Simple in-memory cache for graphs
interface GraphCache {
  graph: GraphRAG;
  indexName: string;
  createdAt: Date;
  nodeCount: number;
}

const graphCache = new Map<string, GraphCache>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

// GraphRAG implementation
class GraphRAG {
  private nodes: Map<string, GraphNode>;
  private edges: GraphEdge[];
  private dimension: number;
  private threshold: number;

  constructor(dimension: number = 1536, threshold: number = 0.7) {
    this.nodes = new Map();
    this.edges = [];
    this.dimension = dimension;
    this.threshold = threshold;
  }

  // Add a node to the graph
  addNode(node: GraphNode): void {
    if (!node.embedding) {
      throw new Error('Node must have an embedding');
    }
    if (node.embedding.length !== this.dimension) {
      throw new Error(`Embedding dimension must be ${this.dimension}`);
    }
    this.nodes.set(node.id, node);
  }

  // Add an edge between two nodes
  addEdge(edge: GraphEdge): void {
    if (!this.nodes.has(edge.source) || !this.nodes.has(edge.target)) {
      throw new Error('Both source and target nodes must exist');
    }
    this.edges.push(edge);
    // Add reverse edge
    this.edges.push({
      source: edge.target,
      target: edge.source,
      weight: edge.weight,
      type: edge.type,
    });
  }

  getNodeCount(): number {
    return this.nodes.size;
  }

  getEdgeCount(): number {
    return this.edges.length / 2; // Divide by 2 because we store bidirectional edges
  }

  // Get neighbors of a node
  private getNeighbors(nodeId: string): { id: string; weight: number }[] {
    return this.edges
      .filter(edge => edge.source === nodeId)
      .map(edge => ({
        id: edge.target,
        weight: edge.weight,
      }));
  }

  // Calculate cosine similarity between two vectors
  private cosineSimilarity(vec1: number[], vec2: number[]): number {
    if (!vec1 || !vec2) {
      throw new Error('Vectors must not be null or undefined');
    }
    if (vec1.length !== vec2.length) {
      throw new Error(`Vector dimensions must match: vec1(${vec1.length}) !== vec2(${vec2.length})`);
    }

    let dotProduct = 0;
    let normVec1 = 0;
    let normVec2 = 0;

    for (let i = 0; i < vec1.length; i++) {
      const a = vec1[i]!;
      const b = vec2[i]!;
      dotProduct += a * b;
      normVec1 += a * a;
      normVec2 += b * b;
    }
    
    const magnitudeProduct = Math.sqrt(normVec1 * normVec2);
    if (magnitudeProduct === 0) {
      return 0;
    }

    const similarity = dotProduct / magnitudeProduct;
    return Math.max(-1, Math.min(1, similarity));
  }

  createGraph(chunks: GraphChunk[], embeddings: GraphEmbedding[]) {
    if (!chunks?.length || !embeddings?.length) {
      throw new Error('Chunks and embeddings arrays must not be empty');
    }
    if (chunks.length !== embeddings.length) {
      throw new Error('Chunks and embeddings must have the same length');
    }

    // Create nodes from chunks
    chunks.forEach((chunk, index) => {
      const node: GraphNode = {
        id: index.toString(),
        content: chunk.text,
        embedding: embeddings[index]?.vector,
        metadata: { ...chunk.metadata },
      };
      this.addNode(node);
    });

    // Create edges based on cosine similarity
    for (let i = 0; i < chunks.length; i++) {
      const firstEmbedding = embeddings[i]?.vector as number[];
      for (let j = i + 1; j < chunks.length; j++) {
        const secondEmbedding = embeddings[j]?.vector as number[];
        const similarity = this.cosineSimilarity(firstEmbedding, secondEmbedding);

        // Only create edges if similarity is above threshold
        if (similarity > this.threshold) {
          this.addEdge({
            source: i.toString(),
            target: j.toString(),
            weight: similarity,
            type: 'semantic',
          });
        }
      }
    }
  }

  private selectWeightedNeighbor(neighbors: Array<{ id: string; weight: number }>): string {
    const totalWeight = neighbors.reduce((sum, n) => sum + n.weight, 0);
    let remainingWeight = Math.random() * totalWeight;

    for (const neighbor of neighbors) {
      remainingWeight -= neighbor.weight;
      if (remainingWeight <= 0) {
        return neighbor.id;
      }
    }

    return neighbors[neighbors.length - 1]?.id as string;
  }

  // Perform random walk with restart
  private randomWalkWithRestart(startNodeId: string, steps: number, restartProb: number): Map<string, number> {
    const visits = new Map<string, number>();
    let currentNodeId = startNodeId;

    for (let step = 0; step < steps; step++) {
      // Record visit
      visits.set(currentNodeId, (visits.get(currentNodeId) || 0) + 1);

      // Decide whether to restart
      if (Math.random() < restartProb) {
        currentNodeId = startNodeId;
        continue;
      }

      // Get neighbors
      const neighbors = this.getNeighbors(currentNodeId);
      if (neighbors.length === 0) {
        currentNodeId = startNodeId;
        continue;
      }

      // Select random weighted neighbor
      currentNodeId = this.selectWeightedNeighbor(neighbors);
    }

    // Normalize visits
    const totalVisits = Array.from(visits.values()).reduce((a, b) => a + b, 0);
    const normalizedVisits = new Map<string, number>();
    for (const [nodeId, count] of visits) {
      normalizedVisits.set(nodeId, count / totalVisits);
    }

    return normalizedVisits;
  }

  // Retrieve relevant nodes using hybrid approach
  query(params: {
    query: number[];
    topK?: number;
    randomWalkSteps?: number;
    restartProb?: number;
  }): RankedNode[] {
    const { query, topK = 10, randomWalkSteps = 100, restartProb = 0.15 } = params;
    if (!query || query.length !== this.dimension) {
      throw new Error(`Query embedding must have dimension ${this.dimension}`);
    }

    // Calculate similarity for all nodes
    const similarities = Array.from(this.nodes.values()).map(node => ({
      node,
      similarity: this.cosineSimilarity(query, node.embedding!),
    }));

    // Sort by similarity
    similarities.sort((a, b) => b.similarity - a.similarity);
    const topNodes = similarities.slice(0, topK);

    // Re-rank nodes using random walk with restart
    const rerankedNodes = new Map<string, { node: GraphNode; score: number }>();

    // For each top node, perform random walk
    for (const { node, similarity } of topNodes) {
      const walkScores = this.randomWalkWithRestart(node.id, randomWalkSteps, restartProb);

      // Combine dense retrieval score with graph score
      for (const [nodeId, walkScore] of walkScores) {
        const node = this.nodes.get(nodeId)!;
        const existingScore = rerankedNodes.get(nodeId)?.score || 0;
        rerankedNodes.set(nodeId, {
          node,
          score: existingScore + similarity * walkScore,
        });
      }
    }

    // Sort by final score and return top K nodes
    return Array.from(rerankedNodes.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map(item => ({
        id: item.node.id,
        content: item.node.content,
        metadata: item.node.metadata,
        score: item.score,
      }));
  }
}

// Input schema
const inputSchema = z.object({
  queryText: z.string().describe('The search query text'),
  indexName: z.string().describe('The name of the index to search in'),
  topK: z.number().optional().default(10).describe('Number of results to return'),
  filter: z.record(z.any()).optional().describe('Metadata filters to apply'),
  graphOptions: z.object({
    randomWalkSteps: z.number().optional().default(100),
    restartProb: z.number().optional().default(0.15),
    threshold: z.number().optional().default(0.7),
    maxGraphNodes: z.number().optional().default(500).describe('Maximum nodes to include in graph'),
    rebuildGraph: z.boolean().optional().default(false).describe('Force rebuild the graph cache'),
  }).optional(),
});

// Output schema
const outputSchema = z.object({
  relevantContext: z.array(z.any()),
  sources: z.array(z.object({
    id: z.string(),
    score: z.number(),
    graphScore: z.number().optional(),
    vectorScore: z.number().optional(),
    metadata: z.any(),
    text: z.string().optional(),
  })),
  graphStats: z.object({
    nodeCount: z.number(),
    edgeCount: z.number(),
    cacheHit: z.boolean(),
    buildTimeMs: z.number().optional(),
  }),
});

export const youtubeGraphRAGTool = createTool({
  id: 'youtube-graph-rag',
  description: 'Advanced GraphRAG search that builds a knowledge graph for better context understanding and result ranking',
  inputSchema,
  outputSchema,
  execute: async ({ context, mastra }) => {
    const { 
      queryText, 
      indexName, 
      topK = 10, 
      filter,
      graphOptions
    } = context;
    
    const randomWalkSteps = graphOptions?.randomWalkSteps ?? 100;
    const restartProb = graphOptions?.restartProb ?? 0.15;
    const threshold = graphOptions?.threshold ?? 0.7;
    const maxGraphNodes = graphOptions?.maxGraphNodes ?? 500;
    const rebuildGraph = graphOptions?.rebuildGraph ?? false;
    
    const logger = mastra?.getLogger ? mastra.getLogger() : undefined;
    
    try {
      // Get connection string
      const connectionString = process.env.POSTGRES_CONNECTION_STRING;
      if (!connectionString) {
        throw new Error('POSTGRES_CONNECTION_STRING is not set');
      }
      
      // Create PgVector instance
      const pgVector = new PgVector({
        connectionString,
        schemaName: 'yt_rag'
      });
      
      if (logger) {
        logger.debug('[YoutubeGraphRAG] Executing search', { 
          queryText, 
          indexName, 
          topK, 
          filter,
          graphOptions 
        });
      }
      
      // Generate embedding for the query
      const { embedding: queryEmbedding } = await embed({
        model: openai.embedding('text-embedding-3-small'),
        value: queryText,
      });
      
      // Check cache
      const cacheKey = `${indexName}_${threshold}`;
      const now = new Date();
      let graphRAG: GraphRAG;
      let cacheHit = false;
      let buildTimeMs: number | undefined;
      
      const cachedGraph = graphCache.get(cacheKey);
      const isCacheValid = cachedGraph && 
        !rebuildGraph &&
        (now.getTime() - cachedGraph.createdAt.getTime()) < CACHE_TTL_MS;
      
      if (isCacheValid && cachedGraph) {
        graphRAG = cachedGraph.graph;
        cacheHit = true;
        if (logger) {
          logger.debug('[YoutubeGraphRAG] Using cached graph', { 
            nodeCount: cachedGraph.nodeCount,
            age: Math.round((now.getTime() - cachedGraph.createdAt.getTime()) / 1000) + 's'
          });
        }
      } else {
        // Build new graph
        const buildStart = Date.now();
        
        if (logger) {
          logger.debug('[YoutubeGraphRAG] Building new graph', { maxGraphNodes });
        }
        
        // Fetch top chunks with embeddings for graph construction
        const graphResults = await pgVector.query({
          indexName,
          queryVector: queryEmbedding,
          filter,
          topK: maxGraphNodes,
          includeVector: true, // Need vectors for graph construction
        });
        
        if (graphResults.length === 0) {
          if (logger) {
            logger.warn('[YoutubeGraphRAG] No results found for graph construction');
          }
          return {
            relevantContext: [],
            sources: [],
            graphStats: {
              nodeCount: 0,
              edgeCount: 0,
              cacheHit: false,
              buildTimeMs: 0,
            },
          };
        }
        
        // Prepare chunks and embeddings for graph
        const chunks: GraphChunk[] = graphResults.map(result => ({
          text: result.metadata?.text || result.metadata?.chapterText || '',
          metadata: result.metadata || {},
        }));
        
        const embeddings: GraphEmbedding[] = graphResults.map(result => ({
          vector: result.vector || [],
        }));
        
        // Create and populate graph
        graphRAG = new GraphRAG(1536, threshold);
        graphRAG.createGraph(chunks, embeddings);
        
        buildTimeMs = Date.now() - buildStart;
        
        // Cache the graph
        graphCache.set(cacheKey, {
          graph: graphRAG,
          indexName,
          createdAt: now,
          nodeCount: graphRAG.getNodeCount(),
        });
        
        if (logger) {
          logger.debug('[YoutubeGraphRAG] Graph built', { 
            nodeCount: graphRAG.getNodeCount(),
            edgeCount: graphRAG.getEdgeCount(),
            buildTimeMs,
          });
        }
      }
      
      // Query the graph
      const rerankedResults = graphRAG.query({
        query: queryEmbedding,
        topK,
        randomWalkSteps,
        restartProb,
      });
      
      if (logger) {
        logger.debug('[YoutubeGraphRAG] Graph query complete', { 
          resultsCount: rerankedResults.length 
        });
      }
      
      // Format results
      const sources = rerankedResults.map(result => ({
        id: result.id,
        score: result.score,
        graphScore: result.score, // The combined score from GraphRAG
        metadata: result.metadata || {},
        text: result.content,
      }));
      
      const relevantContext = rerankedResults.map(result => result.metadata || {});
      
      // Don't disconnect - let Mastra handle connection lifecycle
      
      return {
        relevantContext,
        sources,
        graphStats: {
          nodeCount: graphRAG.getNodeCount(),
          edgeCount: graphRAG.getEdgeCount(),
          cacheHit,
          buildTimeMs,
        },
      };
      
    } catch (error) {
      if (logger) {
        logger.error('[YoutubeGraphRAG] Error during search', {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
      throw error;
    }
  },
});

// Function to clear the graph cache (useful for maintenance)
export function clearGraphCache(indexName?: string) {
  if (indexName) {
    // Clear specific index caches
    const keysToDelete = Array.from(graphCache.keys()).filter(key => key.startsWith(indexName));
    keysToDelete.forEach(key => graphCache.delete(key));
  } else {
    // Clear all caches
    graphCache.clear();
  }
}