# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Mastra-based application that provides weather information and activity planning through an AI agent system. The project uses TypeScript, Node.js (>=20.9.0), and the Mastra framework for building AI agents and workflows.

## Key Commands

- `npm run dev` - Start the Mastra development server
- `npm run build` - Build the Mastra application
- `npm start` - Start the Mastra application in production mode
- `npm test` - Currently not configured (exits with error)

## Architecture

### Core Technologies
- **Mastra Framework**: For AI agents, workflows, and tool creation
- **OpenAI GPT-4**: As the LLM model for the weather agent
- **LibSQL**: For telemetry and memory storage
- **Zod**: For schema validation
- **TypeScript**: With ES2022 modules and strict mode enabled

### Project Structure

The application follows a modular architecture:

1. **Main Configuration** (`src/mastra/index.ts`): Initializes the Mastra instance with workflows, agents, storage, and logging configuration. Currently uses in-memory storage but can be configured to persist to disk.

2. **Weather Agent** (`src/mastra/agents/weather-agent.ts`): An AI agent that provides weather information and activity suggestions. It uses GPT-4o-mini model and has access to the weather tool. The agent maintains conversation memory using LibSQL storage.

3. **Weather Tool** (`src/mastra/tools/weather-tool.ts`): A Mastra tool that fetches real-time weather data using:
   - Open-Meteo Geocoding API for location lookup
   - Open-Meteo Weather API for current conditions
   - Returns temperature, humidity, wind data, and weather conditions

4. **Weather Workflow** (`src/mastra/workflows/weather-workflow.ts`): A two-step workflow that:
   - Fetches weather forecast data for a city
   - Plans activities based on weather conditions using the weather agent
   - Streams responses directly to stdout

### Key Design Patterns

- **Tool Creation**: Uses `createTool` from Mastra with Zod schemas for input/output validation
- **Workflow Composition**: Uses `createWorkflow` with chained steps via `.then()`
- **Agent Integration**: Workflows can access agents through the `mastra` context
- **Error Handling**: Explicit error handling for missing locations and data
- **Type Safety**: Full TypeScript support with strict mode and comprehensive interfaces

## YouTube Content RAG System

### Vue d'ensemble
Système de base de données vectorielle pour stocker et rechercher dans les transcriptions YouTube en utilisant les capacités RAG de Mastra avec une architecture basée sur des workflows.

### Architecture implémentée

#### 1. Workflow d'extraction (`src/mastra/workflows/youtube-rag-workflow.ts`) ✅
Pipeline optimisé en 6 étapes :
1. **Récupère les métadonnées** : Utilise `youtubeMetadataTool` (YouTube API) pour titre, description, etc.
2. **Récupère la transcription** : Utilise `youtubeTranscriptTool` (Apify)
3. **Génère les keywords SEO** : Agent `seoKeywordAgent` avec structured output
4. **Génère les chapitres** : Agent `chapterGeneratorAgent` avec timestamps
5. **Enrichit les chapitres** : Extrait la transcription spécifique de chaque chapitre
6. **Chunking intelligent** : Utilise `youtubeChapterChunkerTool` pour créer un chunk par chapitre avec :
   - Extraction de keywords supplémentaires via MDocument
   - Génération de résumés concis (150 caractères) par chapitre
   - Préservation du contexte complet (1 chunk = 1 chapitre)

#### 2. Système RAG avec PgVector ✅

##### Configuration de la base de données
- **PostgreSQL** avec extension **pgvector** pour le stockage vectoriel
- **Schéma dédié** `yt_rag` pour isoler les données
- **Tables automatiques** créées par PgVector lors de `createIndex()`
- **Index HNSW** pour des performances optimales de recherche

##### Architecture des workflows RAG (approche recommandée)
Au lieu d'utiliser un service, l'architecture privilégie des workflows composables :

1. **youtube-index-workflow** : Pipeline d'indexation
   - Step 1: Exécuter `youtube-rag-workflow` pour extraire les chapitres
   - Step 2: Générer les embeddings avec OpenAI
   - Step 3: Stocker dans PgVector avec métadonnées enrichies

2. **youtube-search-workflow** : Pipeline de recherche
   - Step 1: Générer l'embedding de la requête
   - Step 2: Rechercher dans PgVector
   - Step 3: Reranker et formater les résultats

3. **youtube-rag-agent** : Agent intelligent utilisant `vectorQueryTool`
   - Comprend le contexte des questions
   - Utilise le filtrage par métadonnées
   - Peut reranker les résultats avec GPT-4.1

#### 3. Structure de données enrichie ✅

##### Données extraites par chunk
```typescript
{
  id: string,            // ID unique basé sur le titre du chapitre
  timestamp: string,     // "00:00" format MM:SS
  title: string,         // Titre SEO-optimisé du chapitre
  startTime: number,     // En secondes
  endTime: number,       // En secondes
  text: string,          // Transcription complète du chapitre
  keywords: string[],    // Keywords SEO contextuels + extraits
  summary?: string,      // Résumé concis du chapitre (150 caractères)
  metadata: {
    videoTitle: string,  // Titre de la vidéo YouTube
    chapterTitle: string,
    isFullChapter: true, // Toujours true (1 chunk = 1 chapitre)
    totalChunksInChapter: 1,
    originalChapterLength: number
  }
}
```

##### Métadonnées stockées avec chaque embedding
```typescript
{
  videoUrl: string,
  videoTitle: string,
  chapterTitle: string,
  chapterTimestamp: string,
  chapterStartTime: number,
  chapterEndTime: number,
  keywords: string[],
  indexedAt: Date
}
```

#### 4. Configuration et setup ✅

##### Prérequis
- PostgreSQL 12+ avec extension pgvector
- Variables d'environnement configurées

##### Installation de la base de données
```bash
# Script automatique
./scripts/setup-database.sh

# Ou manuellement
brew install pgvector  # macOS
psql -U postgres -d yt_rag -f scripts/setup-database.sql
```

##### Variables d'environnement requises
```env
# Base de données
POSTGRES_CONNECTION_STRING="postgresql://user:password@localhost:5432/yt_rag"

# APIs
OPENAI_API_KEY="sk-..."
APIFY_API_TOKEN="apify_api_..."
YOUTUBE_API_KEY="AIza..."
```

#### 5. Outils et composants ✅

- **youtubeMetadataTool** : Récupère titre, description et métadonnées via YouTube API
- **youtubeTranscriptTool** : Extrait la transcription complète via Apify
- **youtubeChapterChunkerTool** : Crée des chunks intelligents avec extraction de metadata
- **youtubeVectorQueryTool** : Tool configuré pour PgVector avec filtrage et optimisations
- **PgVector Store** : Configuration avec index HNSW (m=16, efConstruction=64)
- **Embedding Model** : OpenAI text-embedding-3-small (1536 dimensions)
- **Distance Metric** : Cosine similarity pour la recherche sémantique

### Utilisation

#### 1. Extraction et enrichissement des chapitres
```bash
# Test du workflow d'extraction
npx tsx src/test-rag-workflow-with-env.ts
```

#### 2. Indexation d'une vidéo (à implémenter)
```typescript
// Utilisation du youtube-index-workflow
const result = await mastra.workflows.youtubeIndexWorkflow.execute({
  input: { videoUrl: 'https://youtube.com/watch?v=...' }
});
```

#### 3. Recherche sémantique (à implémenter)
```typescript
// Utilisation du youtube-search-workflow
const results = await mastra.workflows.youtubeSearchWorkflow.execute({
  input: { 
    query: 'comment fonctionne l\'IA',
    topK: 5
  }
});
```

#### 4. Utilisation de l'agent RAG
```typescript
// L'agent comprend le contexte et peut filtrer
const response = await youtubeRAGAgent.generate(
  "Trouve des informations sur le machine learning dans les vidéos indexées"
);
```

### Exemple de sortie du workflow d'extraction
```
✅ Workflow completed successfully!

🔑 SEO Keywords: Eric Schmidt, Google chairman, Steel Perlot, ...

📚 Chapters with Transcripts:
1. [00:00] Eric Schmidt's $20B Influence
   Duration: 16s
   Keywords: Eric Schmidt, startup accelerator
   Transcript preview: since leaving Google as chairman...
   ---
```

### Avantages de l'architecture workflow

1. **Modularité** : Chaque workflow est indépendant et réutilisable
2. **Composabilité** : Les workflows peuvent s'appeler entre eux
3. **Observabilité** : Traçage automatique avec la télémétrie Mastra
4. **Type Safety** : Validation avec Zod à chaque étape
5. **Scalabilité** : Peut être déployé sur différentes infrastructures

### Architecture RAG optimisée

1. **Chunking intelligent** : Basé sur les chapitres générés par IA
2. **Métadonnées riches** : Keywords contextuels par chapitre
3. **Timestamps précis** : Conversion automatique MM:SS ↔ secondes
4. **Recherche hybride** : Combinaison de similarité vectorielle et filtrage
5. **Reranking optionnel** : Avec GPT-4.1 pour améliorer la pertinence

### État actuel et prochaines étapes

#### ✅ Implémenté
1. Workflow d'extraction complet avec 6 étapes
2. Métadonnées YouTube via API officielle
3. Chunking intelligent (1 chunk = 1 chapitre)
4. Extraction de keywords et résumés par chapitre
5. Structure de données optimisée pour RAG

#### 🔄 Prochaine étape : Génération des embeddings
La prochaine étape consistera à :
1. Créer un step pour générer les embeddings de chaque chunk
2. Utiliser OpenAI text-embedding-3-small (1536 dimensions)
3. Combiner le résumé + texte pour un embedding plus riche
4. Préparer les données pour le stockage dans PgVector

### Notes importantes
- Toujours utiliser `gpt-4.1` pour les modèles OpenAI (préférence utilisateur)
- Le workflow d'extraction traite une vidéo de 7 min en ~15 secondes
- PgVector crée automatiquement les tables lors du premier `createIndex()`
- L'index HNSW offre le meilleur compromis performance/précision
- Process exit nécessaire pour terminer proprement (`process.exit(0)`)
- JAMAIS faire plus que ce que demande l'utilisateur.