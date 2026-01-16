const jwt = require('jsonwebtoken');

const AUTH_URL = process.env.AUTH_URL || 'https://auth.atap.solar';

/**
 * Shared authentication middleware.
 * Ensures the user has a valid JWT in their cookies.
 */
const requireAuth = (req, res, next) => {
    const token = req.cookies.auth_token;

    const handleAuthFail = () => {
        // If it's an API request, return 401 JSON
        if (req.originalUrl.startsWith('/api/')) {
            return res.status(401).json({ error: 'Unauthorized', redirect: AUTH_URL });
        }
        // Otherwise redirect
        const returnTo = encodeURIComponent(req.protocol + '://' + req.get('host') + req.originalUrl);
        return res.redirect(`${AUTH_URL}/?return_to=${returnTo}`);
    };

    if (!token) {
        return handleAuthFail();
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; 
        next();
    } catch (err) {
        return handleAuthFail();
    }
};

module.exports = { requireAuth };
