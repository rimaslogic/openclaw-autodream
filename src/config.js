import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_CONFIG = {
  maxLines: 200,
  lookbackDays: 30,
  memoryDir: 'memory',
  memoryIndex: 'MEMORY.md',
  categories: [
    'People & Relationships',
    'Projects & Work',
    'Preferences & Style',
    'Technical Decisions',
    'Important Events',
    'Lessons Learned',
  ],
  preservePatterns: ['⚠️', 'IMPORTANT', 'NEVER', 'ALWAYS'],
  triggerThreshold: {
    minHoursSinceLastRun: 24,
    minNewFiles: 5,
  },
  backupDir: '.autodream-backups',
  reportDir: '.autodream-reports',
  lastRun: null,
  filesProcessedAtLastRun: [],
};

const CONFIG_FILE = '.autodream.json';

export function loadConfig(workspacePath) {
  const configPath = path.join(workspacePath, CONFIG_FILE);
  let userConfig = {};

  if (fs.existsSync(configPath)) {
    try {
      const stat = fs.statSync(configPath);
      if (stat.size > 64 * 1024) {
        console.warn(`Warning: ${CONFIG_FILE} exceeds 64KB (${stat.size} bytes), ignoring`);
      } else {
        userConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      }
    } catch (err) {
      console.warn(`Warning: Could not parse ${CONFIG_FILE}: ${err.message}`);
    }
  }

  return { ...DEFAULT_CONFIG, ...userConfig };
}

export function saveConfig(workspacePath, config) {
  const configPath = path.join(workspacePath, CONFIG_FILE);
  const toSave = {
    maxLines: config.maxLines,
    lookbackDays: config.lookbackDays,
    memoryDir: config.memoryDir,
    memoryIndex: config.memoryIndex,
    categories: config.categories,
    preservePatterns: config.preservePatterns,
    triggerThreshold: config.triggerThreshold,
    lastRun: config.lastRun,
    filesProcessedAtLastRun: config.filesProcessedAtLastRun,
  };
  fs.writeFileSync(configPath, `${JSON.stringify(toSave, null, 2)}\n`, 'utf-8');
}
