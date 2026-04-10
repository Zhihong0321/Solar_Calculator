const { getCanonicalUserIdentity } = require('../../../core/auth/userIdentity');

function getAuthenticatedUserId(req) {
    return getCanonicalUserIdentity(req);
}

module.exports = {
    getAuthenticatedUserId
};
