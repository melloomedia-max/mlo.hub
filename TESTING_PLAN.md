# Hub.Melloo.Media — Comprehensive Testing Plan

**Status:** Ready for execution (requires test admin account)

---

## 🎯 Prerequisites

### ✅ COMPLETE

1. ✅ **Health Endpoint** — Added `GET /health` (commit `42d0b34`)
2. ✅ **Test Admin Script** — Created `scripts/create-test-admin.js` (commit `f7309a5`)

### ⚠️ PENDING

3. ⚠️ **Test Admin Account** — Run script on Railway:
   ```bash
   # On Railway server or with DATABASE_URL env var:
   node scripts/create-test-admin.js
   ```
   
   **Credentials:**
   - Email: test@melloo.com
   - Password: TestAdmin123!

---

## 📋 Test Matrix

### Authentication Tests

| Test | Endpoint | Method | Expected | Status |
|------|----------|--------|----------|--------|
| Health check (public) | `/health` | GET | 200 OK | ✅ Verified |
| Staff login (valid) | `/login` | POST | 302 redirect to `/` | 🔲 Pending |
| Staff login (invalid) | `/login` | POST | 302 redirect to `/login?error=invalid` | 🔲 Pending |
| Google OAuth | `/staff/auth/google` | GET | OAuth flow | 🔲 Pending |
| Session persistence | `/api/session/ping` | GET | 200 OK | 🔲 Pending |
| Logout | `/logout` | GET | 302 redirect to `/login` | 🔲 Pending |

---

### Dashboard & Views

| Test | Section | Expected | Status |
|------|---------|----------|--------|
| Dashboard loads | `/` | Revenue overview, unbilled banner, activity feed | 🔲 Pending |
| Tasks view | `/index.html?section=tasks` | Task list, create button, filters | 🔲 Pending |
| Schedule view | `/index.html?section=schedule` | Calendar, meetings | 🔲 Pending |
| Meetings view | `/index.html?section=meetings` | Meeting list, Google Meet integration | 🔲 Pending |
| CRM view | `/index.html?section=crm` | Client list, detail views | 🔲 Pending |
| Invoices view | `/index.html?section=invoices` | Invoice list, create button, payments | 🔲 Pending |
| Subscriptions view | `/index.html?section=subscriptions` | Recurring billing | 🔲 Pending |
| Campaigns view | `/index.html?section=campaigns` | Email campaigns | 🔲 Pending |
| Portal Requests view | `/index.html?section=portal-requests` | Client requests | 🔲 Pending |

---

### API Endpoints (Staff)

#### Tasks API

| Endpoint | Method | Expected | Status |
|----------|--------|----------|--------|
| `/api/tasks` | GET | Task list | 🔲 |
| `/api/tasks` | POST | Create task | 🔲 |
| `/api/tasks/:id` | PUT | Update task | 🔲 |
| `/api/tasks/:id` | DELETE | Delete task | 🔲 |

#### Meetings API

| Endpoint | Method | Expected | Status |
|----------|--------|----------|--------|
| `/api/meetings` | GET | Meeting list | 🔲 |
| `/api/meetings` | POST | Create meeting | 🔲 |
| `/api/meetings/:id` | PUT | Update meeting | 🔲 |
| `/api/meetings/:id` | DELETE | Delete meeting | 🔲 |

#### CRM API

| Endpoint | Method | Expected | Status |
|----------|--------|----------|--------|
| `/api/crm/clients` | GET | Client list | 🔲 |
| `/api/crm/clients` | POST | Create client | 🔲 |
| `/api/crm/clients/:id` | GET | Client details | 🔲 |
| `/api/crm/clients/:id` | PUT | Update client | 🔲 |
| `/api/crm/clients/:id` | DELETE | Delete client | 🔲 |
| `/api/crm/clients/:id/notes` | POST | Add note | 🔲 |
| `/api/crm/clients/:id/files` | POST | Upload file | 🔲 |

#### Invoices API

| Endpoint | Method | Expected | Status |
|----------|--------|----------|--------|
| `/api/invoices` | GET | Invoice list | 🔲 |
| `/api/invoices` | POST | Create invoice | 🔲 |
| `/api/invoices/:id` | GET | Invoice details | 🔲 |
| `/api/invoices/:id` | PUT | Update invoice | 🔲 |
| `/api/invoices/:id` | DELETE | Delete invoice | 🔲 |
| `/api/invoices/:id/payments` | POST | Record payment | 🔲 |

#### Time Tracking API

| Endpoint | Method | Expected | Status |
|----------|--------|----------|--------|
| `/api/time/logs` | GET | Time log list | 🔲 |
| `/api/time/logs` | POST | Create time log | 🔲 |
| `/api/time/logs/:id` | PUT | Update time log | 🔲 |
| `/api/time/logs/:id` | DELETE | Delete time log | 🔲 |
| `/api/time/unbilled` | GET | Unbilled time by client | 🔲 |

#### Subscriptions API

| Endpoint | Method | Expected | Status |
|----------|--------|----------|--------|
| `/api/subscriptions` | GET | Subscription list | 🔲 |
| `/api/subscriptions` | POST | Create subscription | 🔲 |
| `/api/subscriptions/:id` | PUT | Update subscription | 🔲 |
| `/api/subscriptions/:id` | DELETE | Delete subscription | 🔲 |

#### Campaigns API

| Endpoint | Method | Expected | Status |
|----------|--------|----------|--------|
| `/api/campaigns` | GET | Campaign list | 🔲 |
| `/api/campaigns` | POST | Create campaign | 🔲 |
| `/api/campaigns/:id` | GET | Campaign details | 🔲 |
| `/api/campaigns/:id` | PUT | Update campaign | 🔲 |
| `/api/campaigns/:id` | DELETE | Delete campaign | 🔲 |
| `/api/campaigns/:id/send` | POST | Send campaign | 🔲 |

#### Staff Management API (Admin Only)

| Endpoint | Method | Expected | Status |
|----------|--------|----------|--------|
| `/api/staff` | GET | Staff list | 🔲 |
| `/api/staff` | POST | Create staff account | 🔲 |
| `/api/staff/:id` | PUT | Update staff account | 🔲 |
| `/api/staff/:id/toggle-status` | POST | Activate/deactivate | 🔲 |
| `/api/staff/:id/reset-password` | POST | Reset password | 🔲 |

#### Client Portal Management API (Admin Only)

| Endpoint | Method | Expected | Status |
|----------|--------|----------|--------|
| `/api/crm/client-accounts/:id/toggle-portal-access` | POST | Enable/disable portal | 🔲 |
| `/api/crm/client-accounts/:id/update-portal-permissions` | POST | Update permissions | 🔲 |
| `/api/crm/client-accounts/:id/regenerate-portal-token` | POST | Regenerate token | 🔲 |
| `/api/crm/client-accounts/:id/send-portal-link` | POST | Email portal link | 🔲 |

#### Mercury Integration API

| Endpoint | Method | Expected | Status |
|----------|--------|----------|--------|
| `/api/mercury/status` | GET | Configuration status | 🔲 |
| `/api/mercury/accounts` | GET | Mercury accounts | 🔲 |
| `/api/mercury/sync-transactions` | GET | Sync transactions | 🔲 |

#### Settings API (Admin Only)

| Endpoint | Method | Expected | Status |
|----------|--------|----------|--------|
| `/api/settings` | GET | All settings | 🔲 |
| `/api/settings` | POST | Update settings | 🔲 |

#### Archives API (Admin Only)

| Endpoint | Method | Expected | Status |
|----------|--------|----------|--------|
| `/api/archives` | GET | Archive list | 🔲 |
| `/api/archives/:id/restore` | POST | Restore archive | 🔲 |

#### Email API

| Endpoint | Method | Expected | Status |
|----------|--------|----------|--------|
| `/api/email/send` | POST | Send email | 🔲 |
| `/api/email/templates` | GET | Template list | 🔲 |

---

### Settings Panel Tests

| Test | Expected | Status |
|------|----------|--------|
| Staff accounts panel loads | Staff table populated | 🔲 |
| Create new staff account | Modal opens, form works | 🔲 |
| Edit staff account | Pre-filled form, updates work | 🔲 |
| Change staff email | Email updates | 🔲 |
| Reset staff password | Password resets | 🔲 |
| Toggle staff status | Active/inactive works | 🔲 |
| Client portal panel loads | Client list with tokens | 🔲 |
| Toggle portal access | Enable/disable works | 🔲 |
| Update portal permissions | Checkboxes save | 🔲 |
| Regenerate portal token | New token generated | 🔲 |
| Send portal link email | Email sent | 🔲 |
| Branding settings | Form saves | 🔲 |
| Invoice defaults | Form saves | 🔲 |
| Integrations | Google OAuth works | 🔲 |
| Security settings | PIN changes work | 🔲 |

---

### Client Portal Tests

| Test | Expected | Status |
|------|----------|--------|
| Portal login (valid token) | Client dashboard loads | 🔲 |
| Portal login (invalid token) | Error message | 🔲 |
| View projects | Project list shown | 🔲 |
| View invoices | Invoice list shown | 🔲 |
| View files | File list from Drive | 🔲 |
| Submit request | Request created | 🔲 |
| Upload file | File uploaded | 🔲 |

---

### Integration Tests

#### Google OAuth

| Test | Expected | Status |
|------|----------|--------|
| OAuth flow completes | Staff account linked | 🔲 |
| Calendar sync | Events sync | 🔲 |
| Drive access | Files accessible | 🔲 |

#### Mercury Banking

| Test | Expected | Status |
|------|----------|--------|
| Configuration check | Token valid | 🔲 |
| Fetch accounts | Account list returned | 🔲 |
| Sync transactions | Invoices created | 🔲 |
| Duplicate prevention | No duplicate invoices | 🔲 |
| Client matching | Counterparty → client match | 🔲 |

---

### Error Handling Tests

| Test | Expected | Status |
|------|----------|--------|
| 401 Unauthorized | Redirect to login | 🔲 |
| 403 Forbidden | Access denied message | 🔲 |
| 404 Not Found | Proper 404 page | 🔲 |
| 500 Server Error | Graceful error message | 🔲 |
| Database connection failure | Health endpoint shows unhealthy | 🔲 |
| Missing env vars | Proper error messages | 🔲 |

---

### Performance Tests

| Test | Target | Status |
|------|--------|--------|
| Dashboard load time | <2s | 🔲 |
| API response time | <500ms | 🔲 |
| Database query time | <100ms | 🔲 |
| File upload (10MB) | <5s | 🔲 |

---

### Security Tests

| Test | Expected | Status |
|------|----------|--------|
| SQL injection protection | Queries parameterized | 🔲 |
| XSS protection | User input escaped | 🔲 |
| CSRF protection | Tokens required | 🔲 |
| Session security | HttpOnly cookies | 🔲 |
| Password hashing | bcrypt used | 🔲 |
| Admin-only routes | Non-admin blocked | 🔲 |

---

## 🚀 Test Execution Plan

### Phase 1: Authentication & Authorization

1. Create test admin account (run `create-test-admin.js` on Railway)
2. Test staff login flow
3. Test Google OAuth flow
4. Test session persistence
5. Test admin-only route protection

### Phase 2: Core Features

1. Dashboard loading
2. Task CRUD operations
3. Meeting CRUD operations
4. Client CRUD operations
5. Invoice CRUD operations
6. Time tracking

### Phase 3: Advanced Features

1. Subscriptions
2. Email campaigns
3. Portal requests
4. File uploads
5. Settings panels

### Phase 4: Integrations

1. Mercury banking sync
2. Google Calendar sync
3. Google Drive access

### Phase 5: Edge Cases & Errors

1. Error handling
2. Performance benchmarks
3. Security checks

---

## 📊 Success Criteria

**Passing Grade:** 90% of tests passing (green ✅)

**Critical Tests (Must Pass):**
- Authentication flows
- CRUD operations (tasks, clients, invoices)
- Admin-only route protection
- Database connectivity
- Session security

**Non-Critical Tests (Nice to Have):**
- Google OAuth (requires env vars)
- Mercury sync (requires API token)
- Campaign sending (requires email config)

---

## 🛠️ Test Tools

### Automated Testing (Playwright)

```bash
# Install Playwright
npm install -D @playwright/test

# Run tests
npx playwright test

# Generate report
npx playwright show-report
```

### Manual Testing

- Browser DevTools for console errors
- Network tab for API calls
- Application tab for session storage
- Screenshots for visual bugs

### API Testing

```bash
# cURL examples
curl https://hub.melloo.media/health
curl -X POST https://hub.melloo.media/login -d "email=test@melloo.com&password=TestAdmin123!"
```

---

## 📝 Test Report Format

After each test run:

```
## Test Run: YYYY-MM-DD HH:MM

| Category | Passed | Failed | Skipped | Total |
|----------|--------|--------|---------|-------|
| Auth     | 5      | 1      | 0       | 6     |
| CRUD     | 12     | 0      | 0       | 12    |
| Settings | 8      | 2      | 1       | 11    |
| ...      | ...    | ...    | ...     | ...   |

**Total:** 90% passing (135/150 tests)

### Failures:

1. ❌ **Google OAuth** — GOOGLE_CLIENT_ID not set
2. ❌ **Mercury sync** — MERCURY_API_TOKEN not set
3. ❌ **Email campaigns** — SMTP config missing

### Screenshots:

- [Dashboard load](./screenshots/dashboard.png)
- [Invoice creation](./screenshots/invoice-create.png)
```

---

🪢 **melloo — Testing plan ready. Awaiting test admin account creation.**
