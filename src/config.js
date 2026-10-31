'use strict';

const path = require('node:path');
const { normalizeConfig } = require('./lib/config');

/** Load .env quietly (dotenv v17 supports `quiet`), then normalise. */
function loadConfig(env = process.env, options = {}) {
  if (options.loadDotenv !== false) {
    require('dotenv').config({
      path: options.envPath ?? path.join(__dirname, '..', '.env'),
      quiet: true,
    });
  }
  return normalizeConfig(env);
}

module.exports = { loadConfig };
