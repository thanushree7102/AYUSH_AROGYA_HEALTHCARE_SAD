// Combined AYUSH workspace topology:
// Ayurveda owns the one shared infrastructure stack (platform, clinical, longitudinal,
// integrations and event bus). Unani runs only its own domain service and gateway.
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
module.exports = {
  ROOT,
  PROCESSES: [
    ['unani', 'services/unani-service/backend/server.js'],
    ['gateway', 'api-gateway/backend/server.js'],
  ],
};
