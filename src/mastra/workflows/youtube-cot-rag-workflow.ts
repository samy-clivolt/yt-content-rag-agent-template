import { createWorkflow, createStep } from '@mastra/core/workflows';
import { Agent } from '@mastra/core';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import { youtubeIndexListTool } from '../tools/youtube-index-list-tool';
import { youtubeHybridVectorQueryTool } from '../tools/youtube-hybrid-vector-query-tool';
import { RuntimeContext } from '@mastra/core/runtime-context';

// Step 1: Analyze query with Chain of Thought
const analyzeQuery = createStep({
  id: 'analyze-query',
  description: 'Analyze user query and plan search strategy using Chain of Thought',
  inputSchema: z.object({
    query: z.string(),
    availableIndexes: z.array(z.string())
  }),
  outputSchema: z.object({
    reasoning: z.string(),
    searchStrategies: z.array(z.object({
      indexName: z.string(),
      queries: z.array(z.string()),
      rationale: z.string(),
      filters: z.any().optional()
    })),
    keyTerms: z.array(z.string()),
    extractedConstraints: z.object({
      temporal: z.string().optional(),
      popularity: z.string().optional(),
      duration: z.string().optional(),
      channel: z.string().optional(),
      tags: z.array(z.string()).optional()
    }).optional()
  }),
  execute: async ({ inputData }) => {
    const { query, availableIndexes } = inputData;
    
    const reasoningAgent = new Agent({
      name: 'CoT Reasoning Agent',
      model: openai('o4-mini'),
      instructions: `Vous êtes un planificateur de stratégie de recherche avancée. Analysez la requête pour :

1. Identifier ce que l'utilisateur cherche réellement
2. Extraire les contraintes implicites (temporelles, popularité, durée, etc.)
3. Sélectionner les index pertinents PARMI LES DISPONIBLES
4. Formuler plusieurs requêtes de recherche
5. Créer des filtres appropriés pour chaque recherche

Exemples de contraintes à extraire :
- "vidéos récentes" → filtre temporel sur publishedAt
- "contenu populaire" → filtre sur viewCount
- "chapitres courts" → filtre sur chapterDurationSeconds
- "de [nom de chaîne]" → filtre sur channelTitle
- Tags mentionnés → filtre sur tags

IMPORTANT : 
- Utilisez UNIQUEMENT les index présents dans availableIndexes
- Créez des filtres spécifiques basés sur les contraintes extraites
- Les filtres doivent utiliser les opérateurs : $eq, $gt, $gte, $lt, $lte, $in, $between`,
    });
    
    const result = await reasoningAgent.generate(
      `Query: ${query}\n\nAvailable indexes: ${availableIndexes.join(', ')}\n\nPlan une stratégie de recherche exhaustive en utilisant uniquement les index disponibles.`,
      { 
        output: z.object({
          reasoning: z.string(),
          searchStrategies: z.array(z.object({
            indexName: z.string(),
            queries: z.array(z.string()),
            rationale: z.string(),
            filters: z.any().optional()
          })),
          keyTerms: z.array(z.string()),
          extractedConstraints: z.object({
            temporal: z.string().optional(),
            popularity: z.string().optional(),
            duration: z.string().optional(),
            channel: z.string().optional(),
            tags: z.array(z.string()).optional()
          }).optional()
        })
      }
    );
    
    return result.object;
  }
});

// Step 2: List available indexes
const listIndexes = createStep({
  id: 'list-indexes',
  description: 'List all available indexes',
  inputSchema: z.object({}),
  outputSchema: z.object({
    indexes: z.array(z.object({
      name: z.string(),
      category: z.string().optional(),
      stats: z.any().optional()
    })),
    totalIndexes: z.number(),
    schemaName: z.string()
  }),
  execute: async () => {
    const runtimeContext = new RuntimeContext();
    const result = await youtubeIndexListTool.execute({
      context: { includeStats: false },
      runtimeContext
    });
    return result;
  }
});

// Step 3: Execute searches
const executeSearches = createStep({
  id: 'execute-searches',
  description: 'Execute multiple searches based on the CoT strategy',
  inputSchema: z.object({
    searchStrategies: z.array(z.object({
      indexName: z.string(),
      queries: z.array(z.string()),
      rationale: z.string(),
      filters: z.any().optional()
    })),
    availableIndexes: z.array(z.string())
  }),
  outputSchema: z.object({
    allResults: z.array(z.object({
      query: z.string(),
      indexName: z.string(),
      results: z.array(z.any())
    }))
  }),
  execute: async ({ inputData }) => {
    const { searchStrategies, availableIndexes } = inputData;
    const allResults = [];
    const runtimeContext = new RuntimeContext();
    
    for (const strategy of searchStrategies) {
      if (!availableIndexes.includes(strategy.indexName)) {
        console.log(`Skipping non-existent index: ${strategy.indexName}`);
        continue;
      }
      
      for (const query of strategy.queries) {
        try {
          const searchResult = await youtubeHybridVectorQueryTool.execute({
            context: {
              queryText: query,
              indexName: strategy.indexName,
              topK: 5,
              filter: strategy.filters || {},
              scoringWeights: {
                vector: 0.6,
                freshness: 0.2,
                popularity: 0.15,
                tags: 0.05
              },
              includeScore: true
            },
            runtimeContext
          });
          
          allResults.push({
            query,
            indexName: strategy.indexName,
            results: searchResult.sources || []
          });
        } catch (error) {
          console.error(`Search failed for query "${query}" in index "${strategy.indexName}":`, error);
        }
      }
    }
    
    return { allResults };
  }
});

// Step 4: Analyze and synthesize results
const analyzeResults = createStep({
  id: 'analyze-results',
  description: 'Analyze search results and synthesize a comprehensive answer',
  inputSchema: z.object({
    originalQuery: z.string(),
    cotReasoning: z.string(),
    allResults: z.array(z.object({
      query: z.string(),
      indexName: z.string(),
      results: z.array(z.any())
    }))
  }),
  outputSchema: z.object({
    relevantResults: z.array(z.object({
      content: z.string(),
      relevanceScore: z.enum(['high', 'medium', 'low']),
      reasoning: z.string()
    })),
    synthesis: z.string(),
    confidence: z.enum(['high', 'medium', 'low']),
    followUpQuestions: z.array(z.string()).optional()
  }),
  execute: async ({ inputData }) => {
    const { originalQuery, cotReasoning, allResults } = inputData;
    
    const analysisAgent = new Agent({
      name: 'Results Analysis Agent',
      model: openai('gpt-4.1'),
      instructions: `Vous êtes un analyste de résultats. Étant donné les résultats de recherche et le raisonnement original :
1. Évaluez la pertinence de chaque résultat
2. Synthétisez une réponse exhaustive
3. Évaluez votre confiance dans la réponse
4. Suggestion de questions de suivi si nécessaire

Considérez le raisonnement Chain of Thought lors de l'évaluation des résultats.`,
    });
    
    const analysisPrompt = `
Original Query: ${originalQuery}

Chain of Thought Reasoning:
${cotReasoning}

Search Results:
${JSON.stringify(allResults, null, 2)}

Analyze these results and provide a comprehensive answer.
`;
    
    const result = await analysisAgent.generate(analysisPrompt, {
      output: z.object({
        relevantResults: z.array(z.object({
          content: z.string(),
          relevanceScore: z.enum(['high', 'medium', 'low']),
          reasoning: z.string()
        })),
        synthesis: z.string(),
        confidence: z.enum(['high', 'medium', 'low']),
        followUpQuestions: z.array(z.string()).optional()
      })
    });
    
    return result.object;
  }
});

// Create the workflow
export const youtubeCotRagWorkflow = createWorkflow({
  id: 'youtube-cot-rag-workflow',
  description: 'Chain of Thought RAG workflow for YouTube content search',
  inputSchema: z.object({
    query: z.string().describe('The user query to search for')
  }),
  outputSchema: z.object({
    relevantResults: z.array(z.object({
      content: z.string(),
      relevanceScore: z.enum(['high', 'medium', 'low']),
      reasoning: z.string()
    })),
    synthesis: z.string(),
    confidence: z.enum(['high', 'medium', 'low']),
    followUpQuestions: z.array(z.string()).optional()
  })
})
  .map(async () => ({}))
  .then(listIndexes)
  .map(async ({ getStepResult, getInitData }) => ({
    query: getInitData().query,
    availableIndexes: getStepResult(listIndexes).indexes.map(idx => idx.name)
  }))
  .then(analyzeQuery)
  .map(async ({ getStepResult }) => ({
    searchStrategies: getStepResult(analyzeQuery).searchStrategies,
    availableIndexes: getStepResult(listIndexes).indexes.map(idx => idx.name)
  }))
  .then(executeSearches)
  .map(async ({ getStepResult, getInitData }) => ({
    originalQuery: getInitData().query,
    cotReasoning: getStepResult(analyzeQuery).reasoning,
    allResults: getStepResult(executeSearches).allResults
  }))
  .then(analyzeResults)
  .commit();