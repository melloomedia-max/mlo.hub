const crypto = require('crypto');
const db = require('../database');

/**
 * Generate a secure magic link token
 * @returns {string} URL-safe token
 */
function generateToken() {
    return crypto.randomBytes(32).toString('base64url');
}

/**
 * Create a magic link token for a client
 * @param {number} clientId 
 * @param {number} expiryMinutes - Token validity in minutes (default 15)
 * @returns {Promise<string>} The generated token
 */
function createMagicLinkToken(clientId, expiryMinutes = 15) {
    return new Promise((resolve, reject) => {
        const token = generateToken();
        const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);
        
        db.run(
            `INSERT INTO magic_link_tokens (client_id, token, expires_at) VALUES (?, ?, ?)`,
            [clientId, token, expiresAt.toISOString()],
            (err) => {
                if (err) return reject(err);
                resolve(token);
            }
        );
    });
}

/**
 * Verify and consume a magic link token
 * @param {string} token 
 * @returns {Promise<object|null>} Client data if valid, null otherwise
 */
function verifyMagicLinkToken(token) {
    return new Promise((resolve, reject) => {
        db.get(
            `SELECT mlt.*, c.* 
             FROM magic_link_tokens mlt
             JOIN clients c ON mlt.client_id = c.id
             WHERE mlt.token = ? 
             AND mlt.used = 0 
             AND mlt.expires_at > datetime('now')`,
            [token],
            (err, row) => {
                if (err) return reject(err);
                if (!row) return resolve(null);
                
                // Mark token as used
                db.run(
                    `UPDATE magic_link_tokens SET used = 1 WHERE token = ?`,
                    [token],
                    (updateErr) => {
                        if (updateErr) console.error('[magic-link] Failed to mark token as used:', updateErr);
                        resolve(row);
                    }
                );
            }
        );
    });
}

/**
 * Clean up expired magic link tokens (run periodically)
 */
function cleanupExpiredTokens() {
    db.run(
        `DELETE FROM magic_link_tokens WHERE expires_at < datetime('now') OR used = 1`,
        (err) => {
            if (err) console.error('[magic-link] Cleanup failed:', err);
            else console.log('[magic-link] Expired tokens cleaned');
        }
    );
}

// Clean up expired tokens every hour
setInterval(cleanupExpiredTokens, 60 * 60 * 1000);

module.exports = {
    createMagicLinkToken,
    verifyMagicLinkToken,
    cleanupExpiredTokens
};
