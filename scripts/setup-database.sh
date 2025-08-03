#!/bin/bash

# Script pour configurer la base de données PostgreSQL avec pgvector pour YouTube RAG

set -e  # Arrêter en cas d'erreur

echo "🚀 Configuration de la base de données YouTube RAG..."

# Variables de configuration (à adapter selon votre environnement)
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-samy}"
DB_NAME="yt_rag"

# Couleurs pour les messages
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Fonction pour afficher les messages d'erreur
error() {
    echo -e "${RED}❌ Erreur: $1${NC}" >&2
    exit 1
}

# Fonction pour afficher les messages de succès
success() {
    echo -e "${GREEN}✅ $1${NC}"
}

# Fonction pour afficher les messages d'information
info() {
    echo -e "${YELLOW}ℹ️  $1${NC}"
}

# Vérifier que PostgreSQL est installé
if ! command -v psql &> /dev/null; then
    # Essayer de trouver psql dans les chemins courants de Homebrew
    if [ -f "/opt/homebrew/opt/postgresql@16/bin/psql" ]; then
        export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"
    elif [ -f "/opt/homebrew/opt/postgresql@15/bin/psql" ]; then
        export PATH="/opt/homebrew/opt/postgresql@15/bin:$PATH"
    elif [ -f "/usr/local/opt/postgresql@16/bin/psql" ]; then
        export PATH="/usr/local/opt/postgresql@16/bin:$PATH"
    elif [ -f "/usr/local/opt/postgresql@15/bin/psql" ]; then
        export PATH="/usr/local/opt/postgresql@15/bin:$PATH"
    else
        error "PostgreSQL n'est pas installé ou n'est pas dans le PATH. Veuillez l'installer d'abord."
    fi
fi

# Demander le mot de passe si nécessaire
echo -n "Entrez le mot de passe PostgreSQL pour l'utilisateur $DB_USER: "
read -s DB_PASSWORD
echo

# Export pour psql
export PGPASSWORD=$DB_PASSWORD

# Tester la connexion
info "Test de connexion à PostgreSQL..."
if ! psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d postgres -c '\q' 2>/dev/null; then
    error "Impossible de se connecter à PostgreSQL. Vérifiez vos identifiants."
fi
success "Connexion à PostgreSQL réussie"

# Créer la base de données si elle n'existe pas
info "Création de la base de données $DB_NAME..."
if psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d postgres -tc "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" | grep -q 1; then
    info "La base de données $DB_NAME existe déjà"
else
    psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d postgres -c "CREATE DATABASE $DB_NAME"
    success "Base de données $DB_NAME créée"
fi

# Vérifier et installer l'extension pgvector
info "Vérification de l'extension pgvector..."
if ! psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "SELECT 1 FROM pg_extension WHERE extname = 'vector'" | grep -q 1; then
    info "Installation de l'extension pgvector..."
    
    # Essayer d'abord de créer l'extension
    if psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "CREATE EXTENSION IF NOT EXISTS vector" 2>/dev/null; then
        success "Extension pgvector installée"
    else
        echo
        error "L'extension pgvector n'est pas disponible. Veuillez l'installer d'abord:
        
Pour macOS avec Homebrew:
  brew install pgvector
  
Pour Ubuntu/Debian:
  sudo apt install postgresql-15-pgvector
  
Pour d'autres systèmes, consultez: https://github.com/pgvector/pgvector"
    fi
else
    success "Extension pgvector déjà installée"
fi

# Exécuter le script SQL de configuration
info "Configuration du schéma et des tables..."
if psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f scripts/setup-database.sql; then
    success "Schéma et tables configurés"
else
    error "Erreur lors de la configuration du schéma"
fi

# Afficher la chaîne de connexion
echo
success "Configuration terminée!"
echo
info "Chaîne de connexion pour votre fichier .env:"
echo "POSTGRES_CONNECTION_STRING=\"postgresql://$DB_USER:YOUR_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME\""
echo
info "Remplacez YOUR_PASSWORD par votre mot de passe PostgreSQL"

# Nettoyer
unset PGPASSWORD