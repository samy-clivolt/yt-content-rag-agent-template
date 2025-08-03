#!/bin/bash

# Script simplifié pour configurer rapidement la base de données

echo "🚀 Configuration rapide de la base de données YouTube RAG..."

# Ajouter PostgreSQL au PATH
export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"

# Variables
DB_NAME="yt_rag"
DB_USER="samy"

# Créer la base de données
echo "📦 Création de la base de données..."
createdb $DB_NAME 2>/dev/null || echo "La base de données existe déjà"

# Installer pgvector
echo "🔧 Installation de pgvector..."
brew install pgvector 2>/dev/null || echo "pgvector est déjà installé"

# Exécuter le script SQL
echo "🏗️  Configuration du schéma..."
psql -U $DB_USER -d $DB_NAME -f scripts/setup-database.sql

echo "✅ Configuration terminée!"
echo ""
echo "📋 N'oubliez pas de vérifier votre fichier .env :"
echo "POSTGRES_CONNECTION_STRING=\"postgresql://$DB_USER:dimaria7@localhost:5432/$DB_NAME\""