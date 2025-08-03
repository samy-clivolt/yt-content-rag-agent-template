#!/bin/bash

# Script to create hybrid search indexes for all PgVector index tables
# Usage: ./create-all-hybrid-indexes.sh

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}=== Creating Hybrid Search Indexes for YouTube RAG ===${NC}"
echo ""

# Check if POSTGRES_CONNECTION_STRING is set
if [ -z "$POSTGRES_CONNECTION_STRING" ]; then
    echo -e "${RED}Error: POSTGRES_CONNECTION_STRING environment variable is not set${NC}"
    exit 1
fi

# Extract database name from connection string
DB_NAME=$(echo $POSTGRES_CONNECTION_STRING | grep -oP '(?<=/)[^/?]+(?=\?|$)')

echo -e "${GREEN}Database: ${DB_NAME}${NC}"
echo ""

# Get list of all tables in yt_rag schema that are PgVector index tables
# PgVector tables typically have columns: id, embedding, metadata
INDEXES=$(psql "$POSTGRES_CONNECTION_STRING" -t -c "
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'yt_rag' 
    AND table_name NOT IN ('indexed_videos', 'search_logs')
    AND EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'yt_rag' 
        AND table_name = tables.table_name 
        AND column_name = 'metadata'
    )
    ORDER BY table_name;
")

if [ -z "$INDEXES" ]; then
    echo -e "${YELLOW}No PgVector index tables found in schema yt_rag${NC}"
    echo "Make sure you have created at least one index using the YouTube RAG workflow"
    exit 0
fi

echo -e "${GREEN}Found the following index tables:${NC}"
echo "$INDEXES"
echo ""

# Process each index
for INDEX in $INDEXES; do
    INDEX=$(echo $INDEX | xargs) # Trim whitespace
    if [ ! -z "$INDEX" ]; then
        echo -e "${YELLOW}Creating indexes for table: ${INDEX}${NC}"
        
        # Run the SQL script with the index name as parameter
        psql "$POSTGRES_CONNECTION_STRING" -v index_name="$INDEX" -f "$(dirname "$0")/add-hybrid-search-indexes.sql"
        
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✅ Successfully created indexes for: ${INDEX}${NC}"
        else
            echo -e "${RED}❌ Failed to create indexes for: ${INDEX}${NC}"
        fi
        echo ""
    fi
done

echo -e "${GREEN}=== Index creation completed ===${NC}"

# Show index statistics
echo ""
echo -e "${YELLOW}Index statistics:${NC}"
psql "$POSTGRES_CONNECTION_STRING" -c "SELECT * FROM analyze_index_usage();"