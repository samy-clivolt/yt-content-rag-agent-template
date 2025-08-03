-- Script de configuration de la base de données PostgreSQL pour YouTube RAG
-- Prérequis: PostgreSQL avec l'extension pgvector installée

-- Créer la base de données si elle n'existe pas
-- Note: Cette commande doit être exécutée depuis une connexion à PostgreSQL (pas dans la base yt_rag)
-- CREATE DATABASE yt_rag;

-- Se connecter à la base de données yt_rag avant d'exécuter le reste
-- \c yt_rag

-- Créer l'extension pgvector si elle n'existe pas
CREATE EXTENSION IF NOT EXISTS vector;

-- Créer le schéma dédié pour YouTube RAG
CREATE SCHEMA IF NOT EXISTS yt_rag;

-- Définir le search_path pour utiliser le schéma yt_rag par défaut
SET search_path TO yt_rag, public;

-- Table pour stocker les métadonnées des vidéos indexées
CREATE TABLE IF NOT EXISTS yt_rag.indexed_videos (
    id SERIAL PRIMARY KEY,
    video_url TEXT UNIQUE NOT NULL,
    video_title TEXT,
    total_chapters INTEGER DEFAULT 0,
    index_name TEXT,
    indexed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index pour accélérer les recherches par URL
CREATE INDEX IF NOT EXISTS idx_video_url ON yt_rag.indexed_videos(video_url);

-- Index pour accélérer les recherches par index_name
CREATE INDEX IF NOT EXISTS idx_indexed_videos_index_name ON yt_rag.indexed_videos(index_name);

-- Table pour stocker les statistiques d'utilisation
CREATE TABLE IF NOT EXISTS yt_rag.search_logs (
    id SERIAL PRIMARY KEY,
    query TEXT NOT NULL,
    results_count INTEGER DEFAULT 0,
    search_type VARCHAR(50), -- 'global' ou 'video_specific'
    searched_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Fonction pour mettre à jour automatiquement last_updated
CREATE OR REPLACE FUNCTION yt_rag.update_last_updated()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_updated = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger pour mettre à jour last_updated
CREATE TRIGGER update_indexed_videos_last_updated
    BEFORE UPDATE ON yt_rag.indexed_videos
    FOR EACH ROW
    EXECUTE FUNCTION yt_rag.update_last_updated();

-- Afficher les informations de configuration
DO $$
BEGIN
    RAISE NOTICE 'Base de données YouTube RAG configurée avec succès';
    RAISE NOTICE 'Extension pgvector: installée';
    RAISE NOTICE 'Schéma yt_rag: créé';
    RAISE NOTICE 'Tables de métadonnées: créées';
END $$;