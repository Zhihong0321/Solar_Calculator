function getAuthenticatedUserId(req) {
    const candidates = [
        req?.user?.userId,
        req?.user?.id,
        req?.user?.bubbleId,
        req?.user?.bubble_id
    ];

    const resolved = candidates.find((value) => {
        if (value === null || value === undefined) return false;
        return String(value).trim() !== '';
    });

    return resolved ? String(resolved) : null;
}

module.exports = {
    getAuthenticatedUserId
};
