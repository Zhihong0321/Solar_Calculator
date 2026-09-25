const telemarketingRoutes = require('./telemarketingRoutes');
const telemarketingService = require('./services/telemarketingService');
const telemarketingController = require('./telemarketingController');

module.exports = {
  router: telemarketingRoutes,
  service: telemarketingService,
  controller: telemarketingController
};
