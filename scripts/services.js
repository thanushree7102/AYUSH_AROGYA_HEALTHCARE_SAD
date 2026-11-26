// Shared AYUSH services are started only when their central port is free.
// If Ayurveda is already hosting them, this app reuses those running services.
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
module.exports = {
  ROOT,
  PROCESSES: [
    ['bus', 'event-bus/backend/server.js', 'BUS_PORT'],
    ['platform', 'shared-platform/backend/server.js', 'PLATFORM_PORT'],
    ['clinical', 'services/common-clinical-service/backend/server.js', 'CLINICAL_PORT'],
    ['longitudinal', 'longitudinal-record-service/backend/server.js', 'LONGITUDINAL_PORT'],
    ['integrations', 'integrations/backend/server.js', 'INTEGRATIONS_PORT'],
    ['ai', 'ai-service/backend/server.js', 'AI_PORT'],
    ['siddha', 'services/siddha-service/backend/server.js'],
    ['gateway', 'api-gateway/backend/server.js'],
  ],
};
