-- Script pour ajouter la colonne index_name à la table indexed_videos
-- Cette colonne est nécessaire pour savoir dans quel index une vidéo a été stockée

-- Se connecter à la base de données yt_rag avant d'exécuter
-- \c yt_rag

-- Ajouter la colonne index_name à la table indexed_videos
ALTER TABLE yt_rag.indexed_videos 
ADD COLUMN IF NOT EXISTS index_name TEXT;

-- Créer un index pour améliorer les performances des requêtes par index_name
CREATE INDEX IF NOT EXISTS idx_indexed_videos_index_name ON yt_rag.indexed_videos(index_name);

-- Afficher le succès
DO $$
BEGIN
    RAISE NOTICE 'Colonne index_name ajoutée avec succès à la table indexed_videos';
END $$;