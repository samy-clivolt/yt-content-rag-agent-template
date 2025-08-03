-- Add indexes for hybrid search optimization in yt_rag schema
-- Execute this script after the initial database setup
-- 
-- IMPORTANT: This script needs to be run for EACH index table created by PgVector
-- Replace 'INDEX_NAME' with your actual index name (e.g., 'prompt_engineering', 'youtube_chapters', etc.)
-- 
-- Example usage:
-- psql -U postgres -d yt_rag -v index_name=prompt_engineering -f add-hybrid-search-indexes.sql

-- Set the schema
SET search_path TO yt_rag;

-- Use the index_name variable or set a default
\set index_table :index_name

-- Dynamic SQL to create indexes on the specific index table
DO $$
DECLARE
    table_name TEXT := :'index_table';
BEGIN
    -- Check if table exists
    IF EXISTS (SELECT 1 FROM information_schema.tables 
               WHERE table_schema = 'yt_rag' 
               AND table_name = table_name) THEN
        
        RAISE NOTICE 'Creating indexes for table: %', table_name;
        
        -- Index on publishedAt for temporal queries
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_published_at ON yt_rag.%I USING btree ((metadata->>''publishedAt'') DESC)', 
                       table_name, table_name);
        
        -- Index on viewCount for popularity queries
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_view_count ON yt_rag.%I USING btree (CAST(metadata->>''viewCount'' AS BIGINT) DESC)', 
                       table_name, table_name);
        
        -- Index on engagementRate for engagement queries
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_engagement_rate ON yt_rag.%I USING btree (CAST(metadata->>''engagementRate'' AS NUMERIC) DESC)', 
                       table_name, table_name);
        
        -- Index on chapterDurationSeconds for duration-based queries
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_chapter_duration ON yt_rag.%I USING btree (CAST(metadata->>''chapterDurationSeconds'' AS INTEGER))', 
                       table_name, table_name);
        
        -- Index on channelId for channel-specific queries
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_channel_id ON yt_rag.%I USING hash ((metadata->>''channelId''))', 
                       table_name, table_name);
        
        -- GIN index on tags array for tag-based queries
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_tags ON yt_rag.%I USING gin ((metadata->''tags''))', 
                       table_name, table_name);
        
        -- GIN index on searchKeywords array for keyword searches
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_search_keywords ON yt_rag.%I USING gin ((metadata->''searchKeywords''))', 
                       table_name, table_name);
        
        -- Composite index for recent popular content queries
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_recent_popular ON yt_rag.%I USING btree ((metadata->>''publishedAt'') DESC, CAST(metadata->>''viewCount'' AS BIGINT) DESC)', 
                       table_name, table_name);
        
        -- Index on videoLengthMinutes for duration-based video queries
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_video_length ON yt_rag.%I USING btree (CAST(metadata->>''videoLengthMinutes'' AS INTEGER))', 
                       table_name, table_name);
        
        -- Index on isFullChapter for filtering chunk types
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_is_full_chapter ON yt_rag.%I USING btree ((metadata->>''isFullChapter''))', 
                       table_name, table_name);
        
        -- Partial index for high engagement content (engagementRate > 5%)
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_high_engagement ON yt_rag.%I (CAST(metadata->>''engagementRate'' AS NUMERIC)) WHERE CAST(metadata->>''engagementRate'' AS NUMERIC) > 5', 
                       table_name, table_name);
        
        -- Partial index for recent content (last 30 days)
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_recent_content ON yt_rag.%I ((metadata->>''publishedAt'')) WHERE (metadata->>''publishedAt'')::timestamp > CURRENT_TIMESTAMP - INTERVAL ''30 days''', 
                       table_name, table_name);
        
        -- Analyze the table to update statistics
        EXECUTE format('ANALYZE yt_rag.%I', table_name);
        
        RAISE NOTICE 'Indexes created successfully for table: %', table_name;
        
    ELSE
        RAISE EXCEPTION 'Table % does not exist in schema yt_rag', table_name;
    END IF;
END $$;

-- Function to analyze index usage (helpful for monitoring)
CREATE OR REPLACE FUNCTION analyze_index_usage()
RETURNS TABLE (
  index_name text,
  table_name text,
  index_size text,
  index_scans bigint,
  rows_read bigint,
  rows_fetched bigint
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    indexrelname::text AS index_name,
    relname::text AS table_name,
    pg_size_pretty(pg_relation_size(indexrelid)) AS index_size,
    idx_scan AS index_scans,
    idx_tup_read AS rows_read,
    idx_tup_fetch AS rows_fetched
  FROM pg_stat_user_indexes
  WHERE schemaname = 'yt_rag'
  ORDER BY idx_scan DESC;
END;
$$ LANGUAGE plpgsql;

-- Add comments to indexes for documentation
COMMENT ON INDEX idx_metadata_published_at IS 'Optimizes temporal queries (recent videos)';
COMMENT ON INDEX idx_metadata_view_count IS 'Optimizes popularity-based queries';
COMMENT ON INDEX idx_metadata_engagement_rate IS 'Optimizes engagement-based queries';
COMMENT ON INDEX idx_metadata_channel_id IS 'Optimizes channel-specific queries';
COMMENT ON INDEX idx_metadata_tags IS 'Optimizes tag-based filtering';
COMMENT ON INDEX idx_metadata_recent_popular IS 'Optimizes combined recent + popular queries';

-- Analyze tables to update statistics after index creation
ANALYZE embeddings;