#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Couleurs pour l'affichage
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m'
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
  console.log(`${colors.blue}ℹ️  ${message}${colors.reset}`);
}

// Créer une interface readline
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Fonction pour poser une question
function question(prompt, defaultValue = '') {
  return new Promise((resolve) => {
    const displayPrompt = defaultValue ? `${prompt} [${defaultValue}]: ` : `${prompt}: `;
    rl.question(displayPrompt, (answer) => {
      resolve(answer.trim() || defaultValue);
    });
  });
}

// Fonction pour poser une question de mot de passe (masqué)
function passwordQuestion(prompt) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    const stdout = process.stdout;
    
    stdout.write(prompt + ': ');
    
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    
    let password = '';
    
    stdin.on('data', (char) => {
      char = char.toString('utf8');
      
      switch (char) {
        case '\n':
        case '\r':
        case '\u0004':
          stdin.setRawMode(false);
          stdin.pause();
          stdout.write('\n');
          resolve(password);
          break;
        case '\u0003':
          process.exit();
          break;
        case '\u007f':
        case '\b':
          if (password.length > 0) {
            password = password.slice(0, -1);
            stdout.clearLine();
            stdout.cursorTo(0);
            stdout.write(prompt + ': ' + '*'.repeat(password.length));
          }
          break;
        default:
          password += char;
          stdout.write('*');
          break;
      }
    });
  });
}

// Configuration par défaut
const defaultConfig = {
  POSTGRES_CONNECTION_STRING: 'postgresql://user:password@localhost:5432/yt_rag',
  OPENAI_API_KEY: '',
  ANTHROPIC_API_KEY: '',
  VOYAGE_API_KEY: '',
  PORT: '3456'
};

// Fonction principale
async function main() {
  console.log('🔧 Configuration de l\'environnement YouTube RAG\n');
  
  const envPath = path.join(process.cwd(), '.env');
  const envExamplePath = path.join(process.cwd(), '.env.example');
  
  // Vérifier si .env existe déjà
  if (fs.existsSync(envPath)) {
    const overwrite = await question('Le fichier .env existe déjà. Voulez-vous le reconfigurer? (y/N)', 'N');
    if (overwrite.toLowerCase() !== 'y') {
      info('Configuration annulée');
      process.exit(0);
    }
  }
  
  // Créer .env.example s'il n'existe pas
  if (!fs.existsSync(envExamplePath)) {
    const exampleContent = Object.entries(defaultConfig)
      .map(([key, value]) => `${key}="${value}"`)
      .join('\n');
    fs.writeFileSync(envExamplePath, exampleContent + '\n');
    success('Fichier .env.example créé');
  }
  
  console.log('\n📝 Configuration de la base de données PostgreSQL\n');
  
  // Demander les informations PostgreSQL
  const dbHost = await question('Hôte PostgreSQL', 'localhost');
  const dbPort = await question('Port PostgreSQL', '5432');
  const dbUser = await question('Utilisateur PostgreSQL', process.env.USER || 'postgres');
  const dbPassword = await passwordQuestion('Mot de passe PostgreSQL');
  const dbName = await question('Nom de la base de données', 'yt_rag');
  
  const postgresUrl = `postgresql://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/${dbName}`;
  
  console.log('\n🔑 Configuration des clés API\n');
  
  // Demander les clés API
  const openaiKey = await question('Clé API OpenAI (pour les embeddings)');
  const anthropicKey = await question('Clé API Anthropic (pour Claude)');
  const voyageKey = await question('Clé API Voyage (optionnel, appuyez sur Entrée pour ignorer)');
  
  console.log('\n⚙️  Configuration du serveur\n');
  
  // Demander le port
  const serverPort = await question('Port du serveur', '3456');
  
  // Créer le contenu du fichier .env
  const envContent = `# Configuration de la base de données PostgreSQL
POSTGRES_CONNECTION_STRING="${postgresUrl}"

# Clés API
OPENAI_API_KEY="${openaiKey}"
ANTHROPIC_API_KEY="${anthropicKey}"
${voyageKey ? `VOYAGE_API_KEY="${voyageKey}"` : '# VOYAGE_API_KEY=""'}

# Port du serveur
PORT="${serverPort}"
`;
  
  // Écrire le fichier .env
  fs.writeFileSync(envPath, envContent);
  success('Fichier .env créé avec succès!');
  
  console.log('\n📋 Prochaines étapes:\n');
  console.log('1. Exécutez "pnpm run setup:database" pour configurer la base de données');
  console.log('2. Exécutez "pnpm install" pour installer les dépendances');
  console.log('3. Exécutez "pnpm dev" pour démarrer le serveur\n');
  
  rl.close();
}

// Exécuter
main().catch(err => {
  error(`Erreur: ${err.message}`);
  rl.close();
  process.exit(1);
});