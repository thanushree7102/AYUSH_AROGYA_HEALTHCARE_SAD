// Essential processes required by the Ayurveda-only deployment.
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
module.exports = {
  ROOT,
  PROCESSES: [
    ['bus', 'event-bus/backend/server.js'],
    ['platform', 'shared-platform/backend/server.js'],
    ['clinical', 'services/common-clinical-service/backend/server.js'],
    ['ayurveda', 'services/ayurveda-service/backend/server.js'],
    ['longitudinal', 'longitudinal-record-service/backend/server.js'],
    ['integrations', 'integrations/backend/server.js'],
    ['gateway', 'api-gateway/backend/server.js'],
  ],
};
