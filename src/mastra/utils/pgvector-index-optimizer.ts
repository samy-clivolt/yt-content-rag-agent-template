import { Client } from 'pg';

/**
 * Automatically creates optimized indexes for hybrid search on a PgVector index table
 * @param indexName The name of the PgVector index table
 * @param connectionString PostgreSQL connection string
 * @param schemaName Schema name (default: 'yt_rag')
 */
export async function createHybridSearchIndexes(
  indexName: string,
  connectionString: string,
  schemaName: string = 'yt_rag'
): Promise<void> {
  const client = new Client({ connectionString });
  
  try {
    await client.connect();
    
    console.log(`🔧 Creating hybrid search indexes for table: ${indexName}`);
    
    // List of indexes to create with their SQL definitions
    const indexDefinitions = [
      {
        name: `idx_${indexName}_published_at`,
        sql: `CREATE INDEX IF NOT EXISTS idx_${indexName}_published_at ON ${schemaName}.${indexName} USING btree ((metadata->>'publishedAt') DESC)`
      },
      {
        name: `idx_${indexName}_view_count`,
        sql: `CREATE INDEX IF NOT EXISTS idx_${indexName}_view_count ON ${schemaName}.${indexName} USING btree (CAST(metadata->>'viewCount' AS BIGINT) DESC)`
      },
      {
        name: `idx_${indexName}_engagement_rate`,
        sql: `CREATE INDEX IF NOT EXISTS idx_${indexName}_engagement_rate ON ${schemaName}.${indexName} USING btree (CAST(metadata->>'engagementRate' AS NUMERIC) DESC)`
      },
      {
        name: `idx_${indexName}_chapter_duration`,
        sql: `CREATE INDEX IF NOT EXISTS idx_${indexName}_chapter_duration ON ${schemaName}.${indexName} USING btree (CAST(metadata->>'chapterDurationSeconds' AS INTEGER))`
      },
      {
        name: `idx_${indexName}_channel_id`,
        sql: `CREATE INDEX IF NOT EXISTS idx_${indexName}_channel_id ON ${schemaName}.${indexName} USING hash ((metadata->>'channelId'))`
      },
      {
        name: `idx_${indexName}_tags`,
        sql: `CREATE INDEX IF NOT EXISTS idx_${indexName}_tags ON ${schemaName}.${indexName} USING gin ((metadata->'tags'))`
      },
      {
        name: `idx_${indexName}_search_keywords`,
        sql: `CREATE INDEX IF NOT EXISTS idx_${indexName}_search_keywords ON ${schemaName}.${indexName} USING gin ((metadata->'searchKeywords'))`
      },
      {
        name: `idx_${indexName}_recent_popular`,
        sql: `CREATE INDEX IF NOT EXISTS idx_${indexName}_recent_popular ON ${schemaName}.${indexName} USING btree ((metadata->>'publishedAt') DESC, CAST(metadata->>'viewCount' AS BIGINT) DESC)`
      },
      {
        name: `idx_${indexName}_video_length`,
        sql: `CREATE INDEX IF NOT EXISTS idx_${indexName}_video_length ON ${schemaName}.${indexName} USING btree (CAST(metadata->>'videoLengthMinutes' AS INTEGER))`
      },
      {
        name: `idx_${indexName}_is_full_chapter`,
        sql: `CREATE INDEX IF NOT EXISTS idx_${indexName}_is_full_chapter ON ${schemaName}.${indexName} USING btree ((metadata->>'isFullChapter'))`
      }
    ];
    
    // Create all indexes
    for (const indexDef of indexDefinitions) {
      try {
        await client.query(indexDef.sql);
        console.log(`  ✅ Created index: ${indexDef.name}`);
      } catch (error) {
        console.error(`  ❌ Failed to create index ${indexDef.name}:`, error);
      }
    }
    
    // Create partial indexes
    const partialIndexes = [
      {
        name: `idx_${indexName}_high_engagement`,
        sql: `CREATE INDEX IF NOT EXISTS idx_${indexName}_high_engagement ON ${schemaName}.${indexName} (CAST(metadata->>'engagementRate' AS NUMERIC)) WHERE CAST(metadata->>'engagementRate' AS NUMERIC) > 5`
      }
      // Note: Removed partial index for recent content as PostgreSQL doesn't allow 
      // non-immutable functions like CURRENT_TIMESTAMP in partial index predicates
    ];
    
    for (const indexDef of partialIndexes) {
      try {
        await client.query(indexDef.sql);
        console.log(`  ✅ Created partial index: ${indexDef.name}`);
      } catch (error) {
        console.error(`  ❌ Failed to create partial index ${indexDef.name}:`, error);
      }
    }
    
    // Analyze the table to update statistics
    await client.query(`ANALYZE ${schemaName}.${indexName}`);
    console.log(`  ✅ Table analyzed for query optimization`);
    
    console.log(`✨ Hybrid search indexes created successfully for ${indexName}`);
    
  } catch (error) {
    console.error('Error creating hybrid search indexes:', error);
    throw error;
  } finally {
    await client.end();
  }
}

/**
 * Check if hybrid search indexes exist for a given table
 * @param indexName The name of the PgVector index table
 * @param connectionString PostgreSQL connection string
 * @param schemaName Schema name (default: 'yt_rag')
 * @returns true if indexes exist, false otherwise
 */
export async function checkHybridIndexesExist(
  indexName: string,
  connectionString: string,
  schemaName: string = 'yt_rag'
): Promise<boolean> {
  const client = new Client({ connectionString });
  
  try {
    await client.connect();
    
    // Check if at least one of our custom indexes exists
    const result = await client.query(`
      SELECT COUNT(*) as count
      FROM pg_indexes
      WHERE schemaname = $1
      AND tablename = $2
      AND indexname LIKE $3
    `, [schemaName, indexName, `idx_${indexName}_%`]);
    
    return result.rows[0].count > 0;
    
  } catch (error) {
    console.error('Error checking indexes:', error);
    return false;
  } finally {
    await client.end();
  }
}

/**
 * Get statistics about hybrid search indexes
 * @param indexName The name of the PgVector index table
 * @param connectionString PostgreSQL connection string
 * @param schemaName Schema name (default: 'yt_rag')
 */
export async function getIndexStats(
  indexName: string,
  connectionString: string,
  schemaName: string = 'yt_rag'
): Promise<any[]> {
  const client = new Client({ connectionString });
  
  try {
    await client.connect();
    
    const result = await client.query(`
      SELECT 
        indexrelname AS index_name,
        pg_size_pretty(pg_relation_size(indexrelid)) AS index_size,
        idx_scan AS scans,
        idx_tup_read AS tuples_read,
        idx_tup_fetch AS tuples_fetched
      FROM pg_stat_user_indexes
      WHERE schemaname = $1
      AND relname = $2
      ORDER BY idx_scan DESC
    `, [schemaName, indexName]);
    
    return result.rows;
    
  } catch (error) {
    console.error('Error getting index stats:', error);
    return [];
  } finally {
    await client.end();
  }
}