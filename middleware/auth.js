const jwt = require('jsonwebtoken');

const AUTH_URL = process.env.AUTH_URL || 'https://auth.atap.solar';

const requireAuth = (req, res, next) => {
    // 1. Get Token from Cookie
    const token = req.cookies.auth_token;

    if (!token) {
        // Redirect to Auth Hub with Return URL
        const returnTo = encodeURIComponent(req.protocol + '://' + req.get('host') + req.originalUrl);
        return res.redirect(`${AUTH_URL}/?return_to=${returnTo}`);
    }

    try {
        // 2. Verify Token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Attach user to request
        req.user = decoded; 
        // decoded = { userId, phone, role, isAdmin, name }
        
        next();
    } catch (err) {
        // Token invalid or expired
        const returnTo = encodeURIComponent(req.protocol + '://' + req.get('host') + req.originalUrl);
        return res.redirect(`${AUTH_URL}/?return_to=${returnTo}`);
    }
};

module.exports = { requireAuth };
