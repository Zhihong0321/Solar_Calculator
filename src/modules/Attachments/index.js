const attachmentRoutes = require('./api/attachmentRoutes');

const router = require('express').Router();

router.use(attachmentRoutes);

module.exports = {
  router: router
};
