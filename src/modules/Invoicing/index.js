const invoiceRoutes = require('./api/invoiceRoutes');
const invoiceOfficeRoutes = require('./api/invoiceOfficeRoutes');
const invoiceViewRoutes = require('./api/invoiceViewRoutes');
const packageRoutes = require('./api/packageRoutes');
const userRoutes = require('./api/userRoutes');
const paymentRoutes = require('./api/paymentRoutes');
const adminRoutes = require('./api/adminRoutes');
const atsAddonPriceRoutes = require('./api/atsAddonPriceRoutes');

const router = require('express').Router();

// Mount logical sub-routers
router.use(userRoutes);
router.use(packageRoutes);
router.use(invoiceRoutes);
router.use(invoiceOfficeRoutes);
router.use(invoiceViewRoutes);
router.use(paymentRoutes);
router.use(adminRoutes);
router.use(atsAddonPriceRoutes);

module.exports = {
  router: router
};