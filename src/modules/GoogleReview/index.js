const router = require('./googleReviewRoutes');
const service = require('./googleReviewService');
const campaign = require('./campaignService');
const reviewScan = require('./reviewScanService');

module.exports = {
  router,
  service,
  campaign,
  reviewScan
};
