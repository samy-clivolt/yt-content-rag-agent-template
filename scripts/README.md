# Scripts de configuration pour YouTube RAG

## Configuration de la base de données

### Prérequis

1. **PostgreSQL** (version 12 ou supérieure)
2. **Extension pgvector** installée

### Installation de pgvector

#### macOS (avec Homebrew)
```bash
brew install pgvector
```

#### Ubuntu/Debian
```bash
sudo apt install postgresql-15-pgvector
```

#### Depuis les sources
```bash
git clone https://github.com/pgvector/pgvector.git
cd pgvector
make
make install
```

### Utilisation du script de configuration

1. **Exécuter le script automatique** :
```bash
./scripts/setup-database.sh
```

Ce script va :
- Créer la base de données `yt_rag`
- Installer l'extension pgvector
- Créer le schéma `yt_rag`
- Créer les tables nécessaires

2. **Ou exécuter manuellement** :
```bash
# Créer la base de données
psql -U postgres -c "CREATE DATABASE yt_rag;"

# Exécuter le script SQL
psql -U postgres -d yt_rag -f scripts/setup-database.sql
```

### Configuration de l'environnement

Après l'installation, ajoutez la chaîne de connexion à votre fichier `.env` :

```env
POSTGRES_CONNECTION_STRING="postgresql://username:password@localhost:5432/yt_rag"
```

### Vérification de l'installation

Pour vérifier que tout est correctement configuré :

```bash
psql -U postgres -d yt_rag -c "\dn"  # Lister les schémas
psql -U postgres -d yt_rag -c "\dt yt_rag.*"  # Lister les tables du schéma yt_rag
```

### Structure de la base de données

- **Schéma `yt_rag`** : Contient toutes les tables spécifiques au système RAG
- **Table `indexed_videos`** : Métadonnées des vidéos indexées
- **Table `search_logs`** : Logs des recherches effectuées
- **Table auto-créée `youtube_chapters`** : Stockage des vecteurs (créée par PgVector)

### Troubleshooting

Si vous rencontrez l'erreur "extension pgvector not found" :
1. Vérifiez que pgvector est installé : `pg_config --version`
2. Redémarrez PostgreSQL après l'installation
3. Vérifiez les permissions : vous devez être superuser pour créer l'extension