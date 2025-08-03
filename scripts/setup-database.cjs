#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

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

function info(message) {
  console.log(`ℹ️  ${message}`);
}

// Fonction principale
async function main() {
  console.log('🚀 Configuration de la base de données YouTube RAG...\n');
  
  // Vérifier que le fichier .env existe
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) {
    error('Fichier .env manquant. Exécutez d\'abord: pnpm run setup:env');
    process.exit(1);
  }
  
  // Vérifier que le script shell existe
  const scriptPath = path.join(process.cwd(), 'scripts', 'setup-database.sh');
  if (!fs.existsSync(scriptPath)) {
    error('Script setup-database.sh manquant');
    process.exit(1);
  }
  
  // Rendre le script exécutable
  try {
    execSync(`chmod +x "${scriptPath}"`);
  } catch (e) {
    // Ignorer l'erreur sur Windows
  }
  
  // Exécuter le script shell
  try {
    execSync(`bash "${scriptPath}"`, { 
      stdio: 'inherit',
      cwd: process.cwd()
    });
    
    console.log('\n');
    success('Base de données configurée avec succès!');
    console.log('\n📋 Prochaines étapes:');
    console.log('1. Exécutez "pnpm install" si ce n\'est pas déjà fait');
    console.log('2. Exécutez "pnpm dev" pour démarrer le serveur');
    console.log('3. Accédez à http://localhost:3456 pour utiliser l\'application\n');
  } catch (e) {
    error('Erreur lors de la configuration de la base de données');
    if (e.status === 127) {
      console.log('\nAssurez-vous que bash est installé sur votre système.');
      console.log('Sur Windows, utilisez Git Bash ou WSL.');
    }
    process.exit(1);
  }
}

// Exécuter
main().catch(err => {
  error(`Erreur inattendue: ${err.message}`);
  process.exit(1);
});