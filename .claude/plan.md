# Implementation Plan: Split Claim Receipt into Submission + My Claims

## Problem
Agents can submit claim receipts but have no way to view their own submissions. The current system only has:
- **Submit page** (`/claim-submission`) — for creating new claims
- **Review page** (`/api/claim-receipts` GET) — admin/HR only, shows ALL claims

## Solution
Split into two distinct agent-facing pages:
1. **Claim Submission** — existing functionality, unchanged
2. **My Claims** — new page showing only the logged-in agent's submitted claims

## Architecture Decisions

### Data Model
The `claim_receipt` table already stores agent identity via:
- `submitted_by` — agent name (string)
- `submitted_by_user_id` — agent bubble_id (string)
- `submitted_by_email` — agent email

Filter claims by `submitted_by_user_id` to show only the current agent's submissions.

### Route Structure
Follow existing agent route patterns:
- Keep: `POST /api/claim-receipts` — submit new claim
- Keep: `POST /api/claim-receipts/ocr` — OCR preprocessing
- Keep: `GET /api/claim-receipts` — admin/HR review (requireReviewer middleware)
- **New: `GET /api/claim-receipts/mine`** — agent's own claims (requireAuth only)
- Keep: `PUT /api/claim-receipts/:id` — update claim
- Keep: `DELETE /api/claim-receipts/:id` — delete claim

### Frontend Structure
- Keep: `/claim-submission` → `public/templates/claim_submission.html`
- **New: `/my-claims`** → `public/templates/my_claims.html`
- **New: `public/js/my_claims.js`** — fetch and render agent's claims

### Navigation Integration
Add "My Claims" to agent sidebar navigation in `agent_dashboard.html` near other claim-related items (after "SEDA Management", before "Official Email").

## Implementation Steps

### 1. Backend — New Route & Controller Method
**File: `src/modules/ClaimReceipt/claimReceiptRoutes.js`**
- Add route: `router.get('/api/claim-receipts/mine', requireAuth, claimReceiptController.getMyClaims)`
- Place BEFORE the existing `GET /api/claim-receipts` route (specificity: `/mine` before `/:id` patterns)

**File: `src/modules/ClaimReceipt/claimReceiptController.js`**
- Add `exports.getMyClaims` function:
  - Resolve agent identity via `resolveSubmitterIdentity(req)`
  - Call new service method `claimReceiptService.getByUserId(userId)`
  - Return filtered claims as JSON

### 2. Backend — Service Layer Query
**File: `src/modules/ClaimReceipt/claimReceiptService.js`**
- Add method `getByUserId(userId)`:
  - Query: `SELECT * FROM claim_receipt WHERE submitted_by_user_id = $1 ORDER BY created_at DESC`
  - Return array of claims

### 3. Frontend — My Claims Page
**New file: `public/templates/my_claims.html`**
- Based on existing patterns from `claim_submission.html` and `agent_dashboard.html`
- Structure:
  - Header with badge "My Claims" and back link to "← Agent Home"
  - Title: "My Submitted Claims"
  - Empty state message when no claims exist
  - Claims list showing:
    - Vendor name
    - Amount + currency
    - Receipt date
    - Submission date
    - Status (pending/approved/rejected with color coding)
    - Category
    - Actions: View details (expand/collapse), Delete (if pending)
  - Script tag: `<script src="/js/my_claims.js" defer></script>`

**New file: `public/js/my_claims.js`**
- On page load:
  - Fetch agent name from `/api/agent/me` (existing pattern from `claim_submission.js`)
  - Fetch claims from `GET /api/claim-receipts/mine`
  - Render claims as cards/list items
- Features:
  - Expandable claim details (show all fields)
  - Receipt image preview (if file_url exists)
  - Delete button for pending claims (calls `DELETE /api/claim-receipts/:id`)
  - Status badges with color coding:
    - Pending: blue
    - Approved: green
    - Rejected: red
  - Empty state handling

### 4. Frontend — Navigation Integration
**File: `public/templates/agent_dashboard.html`**
- Add navigation item in sidebar (around line 221, after SEDA):
```html
<a href="/my-claims" class="nav-link">
  <i class="fa-solid fa-receipt w-5"></i>
  <span>My Claims</span>
</a>
```

### 5. Backend — Serve HTML Route
**File: `server.js`**
- Add route (around line 350, near other agent routes):
```javascript
app.get('/my-claims', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'templates', 'my_claims.html'));
});
```

## Authorization Model
- **Claim Submission** (`POST /api/claim-receipts`) — requireAuth only (any authenticated user)
- **My Claims** (`GET /api/claim-receipts/mine`) — requireAuth only (filtered by user identity)
- **Admin Review** (`GET /api/claim-receipts`) — requireAuth + requireReviewer (admin/HR only)

## Data Flow
1. Agent clicks "My Claims" in sidebar → navigates to `/my-claims`
2. Browser loads `my_claims.html` → executes `my_claims.js`
3. JS fetches `GET /api/claim-receipts/mine`
4. Controller resolves agent identity via `resolveSubmitterIdentity(req)`
5. Service queries `claim_receipt` WHERE `submitted_by_user_id` = agent's bubble_id
6. Response returns filtered claims
7. JS renders claims as cards with status badges

## Files to Create
1. `public/templates/my_claims.html` — new page
2. `public/js/my_claims.js` — new script

## Files to Modify
1. `src/modules/ClaimReceipt/claimReceiptRoutes.js` — add route
2. `src/modules/ClaimReceipt/claimReceiptController.js` — add getMyClaims()
3. `src/modules/ClaimReceipt/claimReceiptService.js` — add getByUserId()
4. `public/templates/agent_dashboard.html` — add nav item
5. `server.js` — add HTML serving route

## Mobile Optimization
All pages follow mobile-first responsive patterns (confirmed in memory: mobile-only app). The new page will:
- Use single-column card layout
- Touch-friendly buttons (min 44px tap targets)
- Responsive text sizing
- Bottom margin for mobile nav bar
- Match existing styles from `claim_submission.html`

## Activity Logging
Claims are already logged on creation (line 95-103 in controller). No additional logging needed for read operations.

## Testing Checklist
- [ ] Agent can access `/my-claims` page
- [ ] Only logged-in agent's claims are shown
- [ ] Claims ordered by creation date (newest first)
- [ ] Status badges display correct colors
- [ ] Receipt images load and display
- [ ] Delete works for pending claims
- [ ] Empty state shows when no claims
- [ ] Navigation item appears in sidebar
- [ ] Mobile responsive layout works
- [ ] Admin review page still shows all claims (unchanged)
