# Mercury Integration Debug Guide

## Debug Endpoints Added

### 1. `/api/mercury/status`

**Test configuration:**
```bash
curl https://hub.melloo.media/api/mercury/status
```

**Response:**
```json
{
  "configured": true,
  "tokenLength": 64,
  "tokenPrefix": "abc123xyz...",
  "apiBase": "https://api.mercury.com/api/v1",
  "environment": "production"
}
```

**What to check:**
- ✅ `configured: true` means `MERCURY_API_TOKEN` is set
- ✅ `tokenLength` should match your actual token length
- ✅ `tokenPrefix` shows first 10 chars to verify correct token

---

### 2. `/api/mercury/accounts`

**Test accounts endpoint:**
```bash
curl https://hub.melloo.media/api/mercury/accounts
```

**What you'll see in Railway logs:**
```
[MERCURY-DEBUG] mercuryRequest called: { endpoint: '/accounts', method: 'GET', hasToken: true, tokenPrefix: 'abc123xyz...', tokenLength: 64 }
[MERCURY-DEBUG] Fetching URL: https://api.mercury.com/api/v1/accounts
[MERCURY-DEBUG] Headers: { Authorization: 'Bearer abc123xyz...', Content-Type: 'application/json' }
[MERCURY-DEBUG] Response status: 200
[MERCURY-DEBUG] Response headers: { ... }
[MERCURY-DEBUG] Response data keys: [ 'accounts', 'total' ]
[MERCURY] Accounts fetched successfully: { accountCount: 2, accounts: [...] }
```

**If it fails:**
```
[MERCURY-ERROR] API Error: { status: 401, statusText: 'Unauthorized', errorText: '...' }
```

---

### 3. `/api/mercury/sync-transactions?accountId=<id>&limit=10`

**Test transaction sync:**
```bash
curl "https://hub.melloo.media/api/mercury/sync-transactions?accountId=YOUR_ACCOUNT_ID&limit=10"
```

**What you'll see in Railway logs:**
```
[MERCURY-SYNC] Starting transaction sync with params: { accountId: 'abc123', limit: 10 }
[MERCURY-SYNC] Fetching transactions for account abc123...
[MERCURY-SYNC] Full endpoint: /accounts/abc123/transactions?limit=10
[MERCURY-DEBUG] mercuryRequest called: { endpoint: '/accounts/abc123/transactions?limit=10', method: 'GET', ... }
[MERCURY-DEBUG] Fetching URL: https://api.mercury.com/api/v1/accounts/abc123/transactions?limit=10
[MERCURY-DEBUG] Response status: 200
[MERCURY-SYNC] Found 5 transactions
[MERCURY-SYNC] Sample transaction: { id: '...', amount: 1500, counterpartyName: '...', ... }
[MERCURY] Synced transaction tx_123 → invoice 456
```

---

## How to Debug on Railway

### 1. Check Environment Variables

In Railway dashboard:
1. Go to your service
2. Click **Variables**
3. Verify `MERCURY_API_TOKEN` is set correctly
4. Check for extra spaces or newlines in the token

### 2. View Logs

In Railway dashboard:
1. Click **Deployments**
2. Click the latest deployment
3. Click **View Logs**
4. Look for `[MERCURY-DEBUG]`, `[MERCURY-ERROR]`, `[MERCURY-SYNC]` lines

### 3. Test Configuration

```bash
curl https://hub.melloo.media/api/mercury/status
```

**Expected response if token is set:**
```json
{
  "configured": true,
  "tokenLength": 64,
  "tokenPrefix": "your-token...",
  "apiBase": "https://api.mercury.com/api/v1",
  "environment": "production"
}
```

**If `configured: false`:**
- ❌ `MERCURY_API_TOKEN` is not set in Railway
- Add it in Railway dashboard → Variables

### 4. Test Accounts Endpoint

```bash
curl https://hub.melloo.media/api/mercury/accounts
```

**If you see 401 Unauthorized:**
- ❌ Token is invalid or expired
- Check Mercury dashboard for your API key
- Regenerate if necessary

**If you see 200 OK:**
- ✅ Token is valid
- Copy an `accountId` from the response for testing transactions

### 5. Test Transaction Sync

```bash
curl "https://hub.melloo.media/api/mercury/sync-transactions?accountId=YOUR_ACCOUNT_ID&limit=5"
```

**Expected response:**
```json
{
  "success": true,
  "synced": 3,
  "skipped": 2,
  "errors": [],
  "transactions": [
    {
      "id": 123,
      "mercuryId": "tx_abc",
      "amount": 1500,
      "counterparty": "Client Name",
      "date": "2025-01-15T10:30:00Z"
    }
  ]
}
```

---

## Common Issues

### Issue: `configured: false`

**Problem:** `MERCURY_API_TOKEN` not set in Railway  
**Fix:** Add the token in Railway dashboard → Variables

---

### Issue: `401 Unauthorized`

**Problem:** Token is invalid or expired  
**Fix:**
1. Go to Mercury dashboard
2. Navigate to API settings
3. Regenerate API token
4. Update `MERCURY_API_TOKEN` in Railway

---

### Issue: `ECONNREFUSED` or timeout

**Problem:** Mercury API is unreachable  
**Fix:**
- Check Mercury status page
- Verify `MERCURY_API_BASE` is correct (`https://api.mercury.com/api/v1`)
- Check Railway egress firewall rules

---

### Issue: Transactions sync but `client_id` is null

**Problem:** Counterparty names don't match client company names in database  
**Fix:**
- Manually link transactions to clients in the database
- Improve name matching algorithm
- Add manual client mapping UI

---

### Issue: `external_id` conflict

**Problem:** Trying to sync the same transaction twice  
**Expected:** This is normal! Duplicate transactions are automatically skipped (`results.skipped++`)

---

## Log Interpretation

### Successful Request:
```
[MERCURY-DEBUG] mercuryRequest called: { endpoint: '/accounts', method: 'GET', hasToken: true, ... }
[MERCURY-DEBUG] Response status: 200
[MERCURY] Accounts fetched successfully: { accountCount: 2, ... }
```

### Failed Request:
```
[MERCURY-DEBUG] mercuryRequest called: { endpoint: '/accounts', method: 'GET', hasToken: true, ... }
[MERCURY-DEBUG] Response status: 401
[MERCURY-ERROR] API Error: { status: 401, statusText: 'Unauthorized', errorText: 'Invalid token' }
```

### Transaction Sync:
```
[MERCURY-SYNC] Starting transaction sync with params: { accountId: 'abc123', limit: 50 }
[MERCURY-SYNC] Found 20 transactions
[MERCURY] Synced transaction tx_1 → invoice 456
[MERCURY] Synced transaction tx_2 → invoice 457
...
```

---

## Next Steps

1. **Deploy to Railway** (already pushed in commit `32f70bb`)
2. **Check `/api/mercury/status`** to verify token is set
3. **Test `/api/mercury/accounts`** to verify token is valid
4. **Copy account ID** from accounts response
5. **Test `/api/mercury/sync-transactions?accountId=<id>&limit=10`**
6. **Check Railway logs** for detailed debug output

---

**Commit:** `32f70bb` - "Add comprehensive debug logging to Mercury integration"

🪢 **melloo — Debug it, fix it, ship it.**
