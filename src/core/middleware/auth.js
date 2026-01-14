const jwt = require('jsonwebtoken');

const AUTH_URL = process.env.AUTH_URL || 'https://auth.atap.solar';

/**
 * Shared authentication middleware.
 * Ensures the user has a valid JWT in their cookies.
 */
const requireAuth = (req, res, next) => {
    const token = req.cookies.auth_token;

    if (!token) {
        const returnTo = encodeURIComponent(req.protocol + '://' + req.get('host') + req.originalUrl);
        return res.redirect(`${AUTH_URL}/?return_to=${returnTo}`);
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; 
        next();
    } catch (err) {
        const returnTo = encodeURIComponent(req.protocol + '://' + req.get('host') + req.originalUrl);
        return res.redirect(`${AUTH_URL}/?return_to=${returnTo}`);
    }
};

module.exports = { requireAuth };
