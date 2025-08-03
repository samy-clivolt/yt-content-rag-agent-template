#!/usr/bin/env node

const { Client } = require('pg');
const readline = require('readline');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Couleurs pour l'affichage
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m'
};

function success(message) {
  console.log(`${colors.green}✅ ${message}${colors.reset}`);
}

function error(message) {
  console.log(`${colors.red}❌ ${message}${colors.reset}`);
}

function warning(message) {
  console.log(`${colors.yellow}⚠️  ${message}${colors.reset}`);
}

// Créer une interface readline
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Fonction pour poser une question
function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer.trim());
    });
  });
}

// Fonction principale
async function main() {
  console.log('🔄 Réinitialisation de la base de données YouTube RAG\n');
  
  warning('ATTENTION: Cette action va supprimer toutes les données!');
  warning('Cela inclut:');
  console.log('  - Toutes les vidéos indexées');
  console.log('  - Tous les embeddings');
  console.log('  - Tous les logs de recherche');
  console.log('  - Toutes les tables du schéma yt_rag\n');
  
  const confirm = await question('Êtes-vous sûr de vouloir continuer? (tapez "RESET" pour confirmer): ');
  
  if (confirm !== 'RESET') {
    console.log('\nRéinitialisation annulée.');
    rl.close();
    process.exit(0);
  }
  
  const client = new Client({
    connectionString: process.env.POSTGRES_CONNECTION_STRING
  });
  
  try {
    await client.connect();
    console.log('\n🗑️  Suppression des données...\n');
    
    // Supprimer toutes les tables du schéma yt_rag
    const tables = [
      'demo_videos',
      'mastra_lives',
      'prompt_engineering',
      'search_logs',
      'indexed_videos'
    ];
    
    for (const table of tables) {
      try {
        await client.query(`DROP TABLE IF EXISTS yt_rag.${table} CASCADE`);
        success(`Table ${table} supprimée`);
      } catch (err) {
        warning(`Impossible de supprimer la table ${table}: ${err.message}`);
      }
    }
    
    // Supprimer le schéma
    try {
      await client.query('DROP SCHEMA IF EXISTS yt_rag CASCADE');
      success('Schéma yt_rag supprimé');
    } catch (err) {
      warning(`Impossible de supprimer le schéma: ${err.message}`);
    }
    
    console.log('\n🔨 Recréation de la structure...\n');
    
    // Lire et exécuter le script SQL de setup
    const sqlPath = path.join(process.cwd(), 'scripts', 'setup-database.sql');
    if (fs.existsSync(sqlPath)) {
      const sqlContent = fs.readFileSync(sqlPath, 'utf8');
      
      // Exécuter le script SQL
      await client.query(sqlContent);
      success('Structure de base de données recréée');
    } else {
      error('Script setup-database.sql introuvable');
      throw new Error('Script SQL manquant');
    }
    
    console.log('\n✨ Base de données réinitialisée avec succès!\n');
    
  } catch (err) {
    error(`Erreur lors de la réinitialisation: ${err.message}`);
    process.exit(1);
  } finally {
    await client.end();
    rl.close();
  }
}

// Exécuter
main().catch(err => {
  error(`Erreur inattendue: ${err.message}`);
  rl.close();
  process.exit(1);
});