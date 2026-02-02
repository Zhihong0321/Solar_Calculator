const emailRoutes = require('./api/emailRoutes');
const router = require('express').Router();

router.use(emailRoutes);

module.exports = {
  router: router
};
