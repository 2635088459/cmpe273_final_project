# EraseGraph Cloud Demo Guide

**For:** Final presentation and cloud app demonstration  
**Website:** http://34.56.39.214/

---

## 1. Open the App

Go to: **http://34.56.39.214/**

You will see the main dashboard (Overview page).

---

## 2. Overview Page (Dashboard)

This is the landing page that shows the current status of all deletion requests.

### What You See

- **Left side (Deletion Operations)**
  - Large title: "Monitor deletion requests from intake through verification."
  - Explanation text about the workflow
  - Two buttons:
    - "Create deletion request" (orange/blue gradient) — goes to Submit page
    - "Reset search" — clears any active filters

- **Right side (Dashboard Snapshot)**
  - Shows count of:
    - "5 requests" (total deletion requests ever made)
    - "0 Active" (requests still running)
    - "5 Completed" (requests finished successfully)
    - "0 Failed" (requests with failures)

- **Bottom section (Request Tracking)**
  - "Search by request ID or subject ID, filter by status..."
  - Search input box
  - Status dropdown (All statuses, PENDING, RUNNING, COMPLETED, etc.)
  - "Clear filters" button
  - A list of requests showing:
    - Request ID (click to view proof)
    - Subject ID
    - Status badge (green = completed, red = failed)

### How to Use

1. **Search for a request:**
   - Click the search input box
   - Type any part of a request ID or subject ID (e.g., "alice")
   - Results update automatically

2. **Filter by status:**
   - Click the "Status" dropdown
   - Select one of: All statuses, PENDING, RUNNING, COMPLETED, PARTIAL_COMPLETED, FAILED, RETRYING
   - Results update automatically

3. **Clear filters:**
   - Click "Clear filters" button
   - Search and status both reset to empty

4. **Click on a request:**
   - Click on any request row (e.g., the ID or row)
   - You will see the proof and audit trail for that specific request

---

## 3. Submit Request Page

This is where you submit a single deletion request and watch it run in real-time.

### How to Get There

From Overview page:
- Click "Create deletion request" button (orange/blue gradient)

Or:
- Click "Submit Request" in the top navigation bar

### What You See

- **Left side (Hero section)**
  - Large title: "Start a deletion workflow"
  - Form with:
    - Label: "Subject ID to delete"
    - Input field (text box)
    - Button: "Start deletion" (primary color)
  - Additional copy explaining the workflow

- **Right side (Live Progress)**
  - Title: "Deletion in progress..." or result summary
  - Real-time status showing:
    - Overall status: PENDING → RUNNING → COMPLETED/PARTIAL_COMPLETED/FAILED
    - Each cleanup step:
      - Primary database (checkbox when succeeded)
      - Cache (Redis) (checkbox when succeeded)
      - Search index (checkbox when succeeded)
      - Analytics (delayed) (checkbox when succeeded)
      - Backup markers (checkbox when succeeded)
    - A timeline or progress view showing which steps are done

### How to Use - Step by Step

#### Step 1: Enter a Subject ID

1. Click the "Subject ID to delete" input field
2. Type any user identifier, for example:
   - `alice` — standard demo user (will succeed)
   - `bob` — another standard demo user
   - `fail-alice` — will fail on first attempt, then retry and succeed (demo failure handling)
   - `fail-always-bob` — will keep failing and land in DLQ (demo dead-letter queue)
3. Click "Start deletion" button

#### Step 2: Watch Real-Time Progress

After you click "Start deletion":

1. You will see a loading state: "Submission in progress..."
2. The form disappears and is replaced by a live status panel
3. You will see the overall status change:
   - **PENDING** → request created, waiting for processing
   - **RUNNING** → cleanup services are working
4. Individual steps will show status:
   - Empty circle = not started yet
   - Loading spinner = currently processing
   - Green checkmark = succeeded
   - Red X = failed
   - Yellow spinner = retrying (if failure + retry enabled)

#### Step 3: See Final Result

After all steps finish (usually 3-5 seconds):

1. Overall status becomes one of:
   - **COMPLETED** — all steps succeeded
   - **PARTIAL_COMPLETED** — some steps succeeded, analytics still running (eventual consistency demo)
   - **FAILED** — one or more steps failed permanently

2. If failed or stuck, you will see error message:
   - "One or more deletion steps failed. Check history or Jaeger for details."
   - "Lost connection to live stream. You can track this on History page."

3. Once finished, you can:
   - Click "Go back to history" to see all requests
   - Click "Submit another request" to run another demo

### Demo Scenarios to Try

**Scenario 1: Success**
- Subject ID: `alice`
- Expected result: All steps green, status = COMPLETED in ~3 seconds

**Scenario 2: Failure then Retry Success**
- Subject ID: `fail-alice`
- Expected result:
  - Cache step fails first
  - Overall status = PARTIAL_COMPLETED
  - After 5-10 seconds, cache retries
  - All steps eventually succeed, status = COMPLETED

**Scenario 3: Permanent Failure**
- Subject ID: `fail-always-bob`
- Expected result:
  - Cache step fails repeatedly
  - After 3 retries, status = FAILED
  - Message: "...deletion steps failed. Check Jaeger for details."

---

## 4. History Page

See all deletion requests that have been submitted.

### How to Get There

- Click "History" in the top navigation bar

### What You See

- **Hero section (top)**
  - Title: "All past deletion requests in one place."
  - Explanation: "Browse, search, and filter every deletion request submitted to EraseGraph. Click View to inspect proof events for any request."

- **Search and filter section**
  - Search input: "Request ID or subject ID"
  - Status dropdown: All statuses, PENDING, RUNNING, COMPLETED, PARTIAL_COMPLETED, FAILED, RETRYING
  - "Clear filters" button

- **Request list (table)**
  - Each row shows:
    - Request ID (click to view proof)
    - Subject ID
    - Status (green/red badge)
    - Requested at (date/time)
    - Steps completed (e.g., "5 / 5")

### How to Use

1. **Search for requests:**
   - Click search input
   - Type request ID (first few characters) or subject ID
   - List updates automatically

2. **Filter by status:**
   - Open status dropdown
   - Choose one status (or "All statuses")
   - List updates automatically

3. **View proof for a request:**
   - Click on any row in the table
   - You will see the "Proof and Audit Trail" page (explained below)

4. **Refresh list:**
   - Manually: Reload the page (F5)
   - Automatic: List updates whenever search or status changes

---

## 5. Proof and Audit Trail Page

This page shows detailed proof that deletion was processed correctly.

### How to Get There

From History page:
- Click on any request row

Or from Overview page:
- Click on any request in the table

### What You See

- **Summary section (top)**
  - Request ID
  - Subject ID
  - Overall Status (COMPLETED, PARTIAL_COMPLETED, FAILED, etc.)
  - Created at date/time
  - Completed at date/time

- **Proof events (main section)**
  - A timeline of all events, showing:
    - Timestamp
    - Service name (e.g., "primary_data", "cache", "proof_service")
    - Event type (e.g., "DELETION_REQUESTED", "DELETION_STEP_SUCCEEDED", "DELETION_STEP_FAILED")
    - Payload (JSON structure showing details)

- **Export buttons**
  - "Download as JSON" — saves proof events as .json file
  - "Download as CSV" — saves proof events as .csv file
  - "Print" — opens print dialog to print as PDF

- **Verification section**
  - "Verify proof chain" button
  - Shows: "Proof verified ✓" or "Proof tampered ✗"
  - (This demonstrates tamper-evident audit trail)

### How to Use

1. **Review proof events:**
   - Scroll through the timeline
   - Each event shows a detailed payload
   - You can verify which service processed which step and whether it succeeded

2. **Export proof:**
   - Click "Download as JSON" to download proof as JSON file
   - Click "Download as CSV" to download as CSV
   - File name includes request ID and subject ID

3. **Print proof:**
   - Click "Print"
   - Browser print dialog opens
   - Select printer and print to PDF or paper

4. **Verify chain integrity:**
   - Click "Verify proof chain"
   - System checks if proof events have been tampered with
   - You will see: "✓ Proof is valid" or "✗ Proof has been tampered"
   - (If database was manually edited, tamper check will fail)

---

## 6. Demo Users Page

View the demo users in the primary data store and verify deletions worked.

### How to Get There

- Click "Demo Users" in the top navigation bar

### What You See

- **Hero section (left)**
  - Title: "View demo users before and after deletion requests run."
  - Explanation text
  - Two buttons:
    - "Refresh users"
    - "Restore demo users"
  - Info box showing: "Current records: 5 users"

- **User directory (table)**
  - Each row shows:
    - Username (e.g., alice, bob, charlie, diana, eve)
    - User ID (UUID)
    - Created at (date/time)

### How to Use

**Scenario: Verify a deletion worked**

1. **Before deletion:**
   - Click "Refresh users"
   - You see all 5 demo users (alice, bob, charlie, diana, eve)

2. **Submit deletion request:**
   - Go to Submit Request page
   - Enter subject ID: `alice`
   - Watch it complete

3. **After deletion:**
   - Return to Demo Users page
   - Click "Refresh users"
   - `alice` is gone, only 4 users remain (bob, charlie, diana, eve)
   - This confirms deletion propagated to primary database

**Restore demo data for next demo:**

- Click "Restore demo users" button
- Button shows "Restoring..." while loading
- Confirmation message: "Demo users restored. You can run deletion demos again."
- User list reloads with all 5 users again

---

## 7. Bulk Upload Page

Submit multiple deletion requests at once using a CSV file.

### How to Get There

- Click "Bulk Upload" in the top navigation bar

### What You See

- **Hero section**
  - Title: "Upload a CSV to submit multiple deletion requests at once."
  - Instructions about CSV format
  - Info box: "CSV format: The file must have a subject_id column header."

- **Upload area (large section)**
  - Drag-and-drop zone (grey box) with text: "Drag and drop CSV file here"
  - Or click to select file button below
  - Template download: "Download template" button

- **Results section (after upload)**
  - Shows count of:
    - Created: X requests
    - Skipped: Y duplicates or blank rows
  - Detailed results table showing each row:
    - Subject ID
    - Status: "created" (green) or "skipped" (red)

### How to Use - Step by Step

#### Step 1: Get a CSV File

**Option A: Download template**
1. Click "Download template"
2. A file `bulk-deletion-template.csv` is downloaded
3. Open it in a text editor or Excel
4. Default content:
   ```
   subject_id
   alice
   bob

   alice
   ```
   (shows example: alice, bob, blank row, duplicate alice)

**Option B: Create your own**
1. Open a text editor or Excel
2. Create a CSV with column header: `subject_id`
3. Each row below is one deletion request
4. Save as `.csv` file

#### Step 2: Upload the File

1. Click on the grey drag-and-drop area OR click "Choose file" button
2. Select your CSV file from computer
3. File name appears below upload area
4. Click "Upload" button

#### Step 3: See Results

After upload completes:

1. **Success summary:**
   - "3 created" (3 new deletion requests submitted)
   - "1 skipped" (1 duplicate or blank row ignored)

2. **Detailed table:**
   - Subject ID | Status
   - alice | created ✓
   - bob | created ✓
   - charlie | created ✓
   - (blank) | skipped ✗

3. **What happens next:**
   - Each "created" request runs asynchronously
   - You can track them on History page
   - Refresh Demo Users to see data disappearing

#### Step 4: Try Another Upload

- Click "Upload another file"
- Or use "Reset" to clear and start over

### Example CSV to Try

Create a file `demo.csv`:
```
subject_id
alice
bob
charlie
```

Upload it and watch 3 deletion requests get created and tracked.

---

## 8. Admin Page

Advanced operational view: service health, circuit breaker status, SLA violations.

### How to Get There

- Click "Admin" in the top navigation bar

### What You See

**Three sections:**

#### 8.1 Service Health Status

Shows whether each microservice is running:

- Backend service: UP/DOWN (green/red)
- Primary-data-service: UP/DOWN
- Cache-cleanup-service: UP/DOWN
- Search-cleanup-service: UP/DOWN
- Analytics-cleanup-service: UP/DOWN
- Proof-service: UP/DOWN
- Other services...

Each service shows:
- Service name
- Status: UP (green) or DOWN (red)
- Last checked time or error message

**What it means:**
- GREEN (UP): Service is healthy and responding
- RED (DOWN): Service is unreachable or not responding
- If a service is DOWN, deletion requests involving that service may fail or get skipped

#### 8.2 Circuit Breaker Status

Shows the state of each service's circuit breaker:

- primary_data: CLOSED (green)
- cache: CLOSED (green) or OPEN (red)
- search_cleanup: CLOSED (green)
- ...

Each shows:
- Service name
- State: CLOSED (normal), OPEN (skipping), HALF_OPEN (testing)
- Failure count: X failures
- Open until: when circuit will auto-recover

**What it means:**
- **CLOSED**: Service is working normally, accept requests
- **OPEN**: Service has failed 3+ times, skip requests for 30 seconds to let it recover
- **HALF_OPEN**: Recovery window ended, test next request
- If you see OPEN, wait ~30 seconds for it to return to CLOSED

#### 8.3 SLA Violations

Shows deletion requests that are taking too long:

- Request ID
- Subject ID
- Duration: stuck for X minutes
- Status badge: SLA_VIOLATED (red)

**What it means:**
- A deletion request has been stuck (not completing) for longer than expected
- Likely reason: one service is slow or down
- Action: Check the specific request on History page, view proof to see which step is stuck

### How to Use

1. **Check service health:**
   - Go to Admin page
   - If any service shows RED (DOWN):
     - Check the error message
     - Refresh the page (sometimes temporary)
     - If persists, contact ops (backend may need restart)

2. **Monitor circuit breaker:**
   - Look for any OPEN states
   - If cache is OPEN:
     - New deletion requests will skip cache cleanup temporarily
     - Wait ~30 seconds for it to auto-recover to CLOSED
     - Check History page to see if requests had failures

3. **Investigate SLA violations:**
   - If you see a request stuck:
     - Click on the request ID
     - View its proof to see which step is still PENDING
     - Check Jaeger tracing for that service

4. **Manual refresh:**
   - Click "Refresh" button to reload all data
   - Updated every ~5 seconds automatically

---

## 9. Navbar and Navigation

All pages are connected through the top navigation bar.

### Navbar Items (left to right)

1. **Logo (EG)** - Click to return to Overview page
2. **Overview** - Dashboard view
3. **History** - View all past requests
4. **Demo Users** - View/restore demo users
5. **Submit Request** - Create new deletion request
6. **Bulk Upload** - Upload CSV for batch deletions
7. **Admin** - Service health and advanced status

Click any item to navigate to that page.

---

## 10. Typical Demo Flow (5 Minutes)

Follow this sequence for a complete demo:

### Step 1: Show Overview (30 seconds)
1. Open http://34.56.39.214/
2. Explain the dashboard: "Shows status of all deletion requests"
3. Point out statistics: 5 requests, 0 active, 5 completed

### Step 2: Submit a Request (1 minute)
1. Click "Submit Request"
2. Type subject ID: `alice`
3. Click "Start deletion"
4. Watch real-time progress:
   - Show status changing: PENDING → RUNNING → COMPLETED
   - Show each step turning green
5. Wait for all steps to complete (~3 seconds)

### Step 3: View Proof (1 minute)
1. Click "Go back to history" (or click History nav)
2. You should see the request you just created
3. Click on it to view proof
4. Scroll through proof events:
   - Show DELETION_REQUESTED event
   - Show DELETION_STEP_SUCCEEDED for primary_data
   - Show DELETION_STEP_SUCCEEDED for cache
   - Show DELETION_STEP_SUCCEEDED for search_cleanup
   - Show DELETION_STEP_SUCCEEDED for analytics_cleanup
5. Explain: "Complete audit trail of what happened"

### Step 4: Show Demo Users (1 minute)
1. Click "Demo Users"
2. Click "Refresh users"
3. Show that `alice` is no longer in the list
4. Explain: "Deletion propagated to primary database"
5. Click "Restore demo users"
6. Show `alice` is back

### Step 5: Show Failure Handling (1 minute)
1. Click "Submit Request"
2. Type: `fail-alice` (to trigger failure then retry)
3. Watch it fail, then retry and succeed
4. Explain: "Even when service fails, system retries and recovers"

---

## 11. Common Issues and Troubleshooting

### Issue: Page shows "Unable to load..."

**Cause:** Backend API is down or not responding

**Fix:**
1. Wait 10 seconds
2. Reload page (F5)
3. If persists, backend container may have crashed
4. Notify ops/administrator

### Issue: Request stuck in PENDING

**Cause:** Likely a service is down or processing is very slow

**Fix:**
1. Go to Admin page
2. Check Service Health section
3. If a service shows DOWN, that's the issue
4. Wait a minute and refresh
5. If still stuck, view the request proof to see which step is blocked

### Issue: Deletion request shows FAILED

**Cause:** Could be intentional demo (`fail-always-*` subject ID) or real service failure

**Fix:**
1. Go to History page
2. Click on the failed request
3. View proof events to see which step failed
4. If subject ID was `fail-always-*`, this is expected demo behavior
5. Otherwise, check Admin page for circuit breaker status or health issues

### Issue: Demo Users page shows 0 users

**Cause:** All demo users have been deleted

**Fix:**
1. Click "Restore demo users"
2. Confirm: "Demo users restored..."
3. Now you can submit new deletion requests

### Issue: Frontend loads but shows blank page

**Cause:** React app may not have loaded correctly or API URL is wrong

**Fix:**
1. Hard refresh: Ctrl+Shift+R (or Cmd+Shift+R on Mac)
2. Clear browser cache
3. Try a different browser
4. Check browser console (F12) for errors

---

## 12. Key Features to Highlight During Demo

### 1. Real-Time Progress Streaming (SSE)

When you submit a request:
- Watch the status update in real-time without refreshing
- Show how each step completes as it happens
- **Message:** "We use Server-Sent Events for real-time updates"

### 2. Failure and Recovery

Use subject ID `fail-alice`:
- Show cache service fails
- Show status becomes PARTIAL_COMPLETED
- Show automatic retry after 5 seconds
- Show successful completion
- **Message:** "The system automatically retries failed steps"

### 3. Audit Trail (Proof)

After any deletion:
- Go to History
- Click to view proof
- Show tamper-evident hash chain verification
- **Message:** "Every step is recorded with cryptographic verification"

### 4. Multi-Service Coordination

Show in proof that multiple services ran:
- Primary database deleted user
- Cache deleted key
- Search index cleared document
- Analytics soft-deleted record
- **Message:** "One deletion request coordinates across 5+ services"

### 5. Observability

In proof view:
- Show timestamps of each event
- Show service names
- Show JSON payloads with details
- **Message:** "Full transparency into system behavior"

---

## 13. Q&A Responses

**Q: What if one service is down?**  
A: The request becomes PARTIAL_COMPLETED (some services succeeded). Once the service recovers, circuit breaker allows retries and the request eventually completes.

**Q: How do you prevent duplicate deletions?**  
A: Every event has a unique ID, and we store processed event IDs. If the same event is redelivered, we skip processing but still mark it as successful.

**Q: What about data that can't be deleted?**  
A: Some data (like analytics) is soft-deleted (marked deleted, not hard-removed). This is intentional for compliance and audit purposes.

**Q: How do you verify deletion actually happened?**  
A: Go to Demo Users page before and after. You'll see the record disappear from primary database, confirming deletion propagated.

**Q: What if the proof is tampered with?**  
A: Click "Verify proof chain" on proof page. It will show "✗ Proof tampered" if database was manually edited.

---

## Summary

**EraseGraph Demo Checklist:**

- [ ] Open http://34.56.39.214/
- [ ] Show Overview dashboard
- [ ] Submit deletion for `alice`
- [ ] Watch real-time progress
- [ ] View proof events
- [ ] Check Demo Users page (alice gone)
- [ ] Restore demo users
- [ ] Submit `fail-alice` to show failure + retry
- [ ] Check Admin page for circuit breaker status
- [ ] Bulk upload 3 users via CSV
- [ ] Explain architecture and why it matters

**Total demo time:** 5-7 minutes  
**Audience:** Professor, evaluators, peers
