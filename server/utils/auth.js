const crypto = require('crypto');

/**
 * Hash a password using PBKDF2
 * @param {string} password 
 * @returns {string} salt:hash
 */
function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
    return `${salt}:${hash}`;
}

/**
 * Verify a password against a stored hash
 * @param {string} password 
 * @param {string} storedHash salt:hash
 * @returns {boolean}
 */
function verifyPassword(password, storedHash) {
    if (!storedHash || !storedHash.includes(':')) return false;
    const [salt, hash] = storedHash.split(':');
    const verifyHash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
    return hash === verifyHash;
}

/**
 * Middleware to require authentication
 */
function requireAuth(req, res, next) {
    // LOCAL DEV BYPASS
    const host = req.get('host') || '';
    if (host.includes('localhost') || host.includes('127.0.0.1')) {
        req.session.isAuthenticated = true;
        req.session.user = req.session.user || { id: 0, name: 'Dev Admin', role: 'admin', email: 'dev@melloo.media' };
        return next();
    }

    const isAuth = !!(req.session && req.session.isAuthenticated);
    
    if (isAuth) {
        return next();
    }
    
    if (req.path.startsWith('/api/')) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.redirect('/login');
}

/**
 * Middleware to require admin roll
 */
function requireAdmin(req, res, next) {
    // LOCAL DEV BYPASS
    const host = req.get('host') || '';
    if (host.includes('localhost') || host.includes('127.0.0.1')) {
        req.session.isAuthenticated = true;
        req.session.user = req.session.user || { id: 0, name: 'Dev Admin', role: 'admin', email: 'dev@melloo.media' };
        return next();
    }

    const isAuth = !!(req.session && req.session.isAuthenticated);
    const isAdmin = !!(isAuth && req.session.user && req.session.user.role === 'admin');
    
    if (isAdmin) {
        return next();
    }
    
    if (req.path.startsWith('/api/')) {
        return res.status(403).json({ error: 'Admin access required' });
    }
    return res.redirect('/login?error=admin');
}

module.exports = {
    hashPassword,
    verifyPassword,
    requireAuth,
    requireAdmin
};
