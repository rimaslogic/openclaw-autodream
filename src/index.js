'use strict';

const { consolidate, getStats } = require('./consolidator');
const { loadConfig, saveConfig } = require('./config');
const { analyzeFile } = require('./analyzer');
const { normalizeDates } = require('./normalizer');
const { deduplicate } = require('./deduplicator');
const { pruneEntries } = require('./pruner');

module.exports = {
  consolidate,
  getStats,
  loadConfig,
  saveConfig,
  analyzeFile,
  normalizeDates,
  deduplicate,
  pruneEntries
};
