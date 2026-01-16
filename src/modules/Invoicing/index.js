const invoiceRoutes = require('./api/routes');
const adminRoutes = require('./api/adminRoutes');

const router = require('express').Router();
router.use(invoiceRoutes);
router.use(adminRoutes);

module.exports = {
  router: router
};
