const voucherRoutes = require('./api/voucherRoutes');
const router = require('express').Router();

// Mount logical sub-routers
router.use(voucherRoutes);

module.exports = {
    router: router
};
