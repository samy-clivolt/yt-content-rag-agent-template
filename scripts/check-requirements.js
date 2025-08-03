#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

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

function info(message) {
  console.log(`ℹ️  ${message}`);
}

// Vérifier Node.js
function checkNode() {
  try {
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.split('.')[0].substring(1));
    
    if (majorVersion >= 18) {
      success(`Node.js ${nodeVersion} installé`);
      return true;
    } else {
      error(`Node.js ${nodeVersion} détecté. Version 18+ requise`);
      return false;
    }
  } catch (e) {
    error('Node.js non détecté');
    return false;
  }
}

// Vérifier pnpm
function checkPnpm() {
  try {
    const pnpmVersion = execSync('pnpm --version', { encoding: 'utf8' }).trim();
    success(`pnpm ${pnpmVersion} installé`);
    return true;
  } catch (e) {
    error('pnpm non installé. Installez avec: npm install -g pnpm');
    return false;
  }
}

// Vérifier PostgreSQL
function checkPostgreSQL() {
  try {
    // Essayer différents chemins pour psql
    const paths = [
      'psql',
      '/opt/homebrew/opt/postgresql@16/bin/psql',
      '/opt/homebrew/opt/postgresql@15/bin/psql',
      '/usr/local/opt/postgresql@16/bin/psql',
      '/usr/local/opt/postgresql@15/bin/psql'
    ];
    
    let psqlPath = null;
    for (const path of paths) {
      try {
        execSync(`${path} --version`, { encoding: 'utf8' });
        psqlPath = path;
        break;
      } catch (e) {
        // Continuer avec le prochain chemin
      }
    }
    
    if (psqlPath) {
      const version = execSync(`${psqlPath} --version`, { encoding: 'utf8' }).trim();
      success(`PostgreSQL installé: ${version}`);
      return true;
    } else {
      throw new Error('psql non trouvé');
    }
  } catch (e) {
    error('PostgreSQL non détecté');
    console.log('Installez PostgreSQL:');
    console.log('  macOS: brew install postgresql');
    console.log('  Ubuntu: sudo apt install postgresql');
    return false;
  }
}

// Vérifier le fichier .env
function checkEnvFile() {
  const envPath = path.join(process.cwd(), '.env');
  
  if (!fs.existsSync(envPath)) {
    error('Fichier .env manquant');
    console.log('Copiez .env.example vers .env et configurez vos variables');
    return false;
  }
  
  const envContent = fs.readFileSync(envPath, 'utf8');
  const requiredVars = [
    'POSTGRES_CONNECTION_STRING',
    'OPENAI_API_KEY',
    'ANTHROPIC_API_KEY'
  ];
  
  const missingVars = [];
  const emptyVars = [];
  
  requiredVars.forEach(varName => {
    const regex = new RegExp(`^${varName}=(.*)$`, 'm');
    const match = envContent.match(regex);
    
    if (!match) {
      missingVars.push(varName);
    } else if (!match[1] || match[1].trim() === '' || match[1].trim() === '""' || match[1].trim() === "''") {
      emptyVars.push(varName);
    }
  });
  
  if (missingVars.length > 0) {
    error(`Variables manquantes dans .env: ${missingVars.join(', ')}`);
    return false;
  }
  
  if (emptyVars.length > 0) {
    warning(`Variables vides dans .env: ${emptyVars.join(', ')}`);
    console.log('Assurez-vous de configurer ces variables avant de continuer');
    return false;
  }
  
  success('Fichier .env configuré');
  return true;
}

// Fonction principale
async function main() {
  console.log('🔍 Vérification des prérequis...\n');
  
  const checks = [
    { name: 'Node.js', check: checkNode },
    { name: 'pnpm', check: checkPnpm },
    { name: 'PostgreSQL', check: checkPostgreSQL },
    { name: 'Configuration .env', check: checkEnvFile }
  ];
  
  let allPassed = true;
  
  for (const { name, check } of checks) {
    info(`Vérification de ${name}...`);
    const passed = check();
    if (!passed) {
      allPassed = false;
    }
    console.log('');
  }
  
  if (allPassed) {
    success('Tous les prérequis sont satisfaits! 🎉');
    process.exit(0);
  } else {
    error('Certains prérequis ne sont pas satisfaits.');
    console.log('\nCorrigez les problèmes ci-dessus avant de continuer.');
    process.exit(1);
  }
}

// Exécuter
main().catch(err => {
  error(`Erreur inattendue: ${err.message}`);
  process.exit(1);
});