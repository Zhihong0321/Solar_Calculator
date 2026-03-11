const healthRoutes = require('./api/routes');
const { startHealthCheckScheduler } = require('./services/healthCheckService');

module.exports = {
  router: healthRoutes,
  startHealthCheckScheduler
};
