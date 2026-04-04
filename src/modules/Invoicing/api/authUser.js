function getAuthenticatedUserId(req) {
    const userId = req?.user?.userId ?? req?.user?.id ?? null;
    return userId ? String(userId) : null;
}

module.exports = {
    getAuthenticatedUserId
};
