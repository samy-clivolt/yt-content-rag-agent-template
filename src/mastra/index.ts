
import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';
import { PgVector } from '@mastra/pg';
import { chapterGeneratorAgent } from './agents/chapter-generator-agent';
import { youtubeRAGAgent } from './agents/youtube-rag-agent';
import { youtubeRagWorkflow } from './workflows/youtube-rag-workflow';
import { youtubeCotRagWorkflow } from './workflows/youtube-cot-rag-workflow';

export const mastra = new Mastra({
  workflows: { youtubeRagWorkflow, youtubeCotRagWorkflow },
  agents: { chapterGeneratorAgent, youtubeRAGAgent },

  storage: new LibSQLStore({
    // stores telemetry, evals, ... into memory storage, if it needs to persist, change to file:../mastra.db
    url: "file:../mastra.db",
  }),
  
  vectors: process.env.POSTGRES_CONNECTION_STRING ? {
    pgVector: new PgVector({
      connectionString: process.env.POSTGRES_CONNECTION_STRING,
      schemaName: 'yt_rag'
    })
  } : undefined,
  
  logger: new PinoLogger({
    name: 'Mastra',
    level: 'info',
  }),
});


