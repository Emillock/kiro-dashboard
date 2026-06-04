# User Stories — Kiro NRT Dashboard

**Breakdown**: Feature-based (Q1=A) · **Acceptance criteria**: Gherkin (Q3=A) ·
**Granularity**: Medium, one behavior per story (Q4=B) · **NFRs as stories**: Yes (Q5=A)

**Personas**: Maya = Metrics Viewer · Tariel = Team Lead · Orkhan = App Operator
**Priority**: Must / Should / Could (MoSCoW)

Traceability references the requirement IDs in `../requirements/requirements.md`.

---

## Epic A — Authentication & Accounts

### US-AUTH-01 — Register an account
**Priority**: Must · **Personas**: Maya, Tariel, Orkhan · **Traces**: FR-1.1, FR-1.3, FR-1.6
**Story**: As a new user, I want to register with my email, username, and password so that I can
access the dashboard.

```gherkin
Scenario: Successful registration
  Given I am on the registration page
  And no account exists with email "user20@example.com" or username "user1"
  When I submit email "user20@example.com", username "user1", and a valid password
  Then my account is created with the password stored as a bcrypt hash
  And I am able to log in with those credentials

Scenario: Duplicate email or username is rejected
  Given an account already exists with email "user20@example.com"
  When I submit a registration with email "user20@example.com"
  Then registration is rejected with a clear "email already in use" message
  And no new account is created

Scenario: Invalid input is rejected
  Given I am on the registration page
  When I submit an invalid email or a password shorter than the minimum length
  Then registration is rejected with a specific validation message
```

### US-AUTH-02 — Log in
**Priority**: Must · **Personas**: Maya, Tariel, Orkhan · **Traces**: FR-1.2, FR-1.4
**Story**: As a registered user, I want to log in with my email and password so that I receive an
access token for the app.

```gherkin
Scenario: Successful login issues a JWT
  Given I have a registered account
  When I submit my correct email and password
  Then I receive a JWT access token
  And I am redirected to the main dashboard

Scenario: Wrong credentials are rejected
  Given I have a registered account
  When I submit an incorrect password
  Then login fails with a generic "invalid credentials" message
  And no token is issued
```

### US-AUTH-03 — Access control on protected routes
**Priority**: Must · **Personas**: Maya, Tariel · **Traces**: FR-1.4, FR-1.5, FR-7.2
**Story**: As a logged-in user, I want all dashboard pages and data APIs to require my token so that
unauthenticated visitors cannot view metrics.

```gherkin
Scenario: Unauthenticated access is blocked
  Given I do not have a valid token
  When I request a protected dashboard API or page
  Then I am denied access and redirected to the login page

Scenario: Authenticated access is allowed
  Given I hold a valid, unexpired JWT
  When I request any dashboard API
  Then the request succeeds and returns the shared data (visible to all logged-in users)
```

### US-AUTH-04 — Log out
**Priority**: Should · **Personas**: Maya, Tariel, Orkhan · **Traces**: FR-1.7
**Story**: As a logged-in user, I want to log out so that my session token is no longer usable from
this browser.

```gherkin
Scenario: Logout clears the session
  Given I am logged in
  When I click "Log out"
  Then my token is discarded on the client
  And I am returned to the login page
  And subsequent protected requests without a token are denied
```

---

## Epic B — Data Ingestion & Parsing

### US-DATA-01 — Read AWS credentials from environment
**Priority**: Must · **Personas**: Orkhan · **Traces**: FR-2.1, NFR-4.2
**Story**: As an operator, I want the backend to read AWS credentials only from `.env` so that no
secrets are hard-coded or committed.

```gherkin
Scenario: Credentials sourced from environment
  Given AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_DEFAULT_REGION are set in the environment
  When the backend connects to S3
  Then it authenticates using those environment values
  And no credential value appears in source code, logs, or API responses
```

### US-DATA-02 — Fetch reports for a date range
**Priority**: Must · **Personas**: Maya, Tariel (consumers) · **Traces**: FR-2.2, NFR-3.1
**Story**: As a viewer, I want the backend to fetch the daily report CSVs for the selected period so
that the dashboard reflects that period.

```gherkin
Scenario: Fetch a week or month of reports
  Given the user selects a time range
  When the backend lists the S3 prefix for each day in range
  Then it downloads all KIRO_IDE and KIRO_CLI CSVs present for those days

Scenario: Missing days are tolerated
  Given some days in the range have no report files
  When the backend fetches the range
  Then those days are skipped without error
  And available days are still processed
```

### US-DATA-03 — Parse the evolving CSV schema dynamically
**Priority**: Must · **Personas**: Orkhan · **Traces**: FR-2.3, NFR-3.1
**Story**: As an operator, I want the parser to handle the changing column set so that new model
columns never break ingestion.

```gherkin
Scenario: Stable core columns are always read
  Given a report CSV with the 11 stable core columns
  When the parser reads a row
  Then Date, UserId, Client_Type, Chat_Conversations, Credits_Used, Total_Messages, and
       Subscription_Tier are extracted correctly

Scenario: Dynamic per-model message columns are discovered at runtime
  Given a report CSV containing columns matching "*_messages" (e.g. claude_opus_4.8_messages, glm_5_messages)
  When the parser reads the file
  Then each "*_messages" column is captured as a per-model message count
  And columns absent from a given file default to zero

Scenario: Unknown/extra columns do not crash parsing
  Given a report CSV with a previously unseen column
  When the parser reads it
  Then ingestion completes and the unknown column is ignored or stored generically
```

### US-DATA-04 — Combine IDE and CLI per user
**Priority**: Must · **Personas**: Maya, Tariel · **Traces**: FR-2.5, FR-2.6
**Story**: As a viewer, I want a user's IDE and CLI activity combined so that I see one total per
user.

```gherkin
Scenario: Same UserId across IDE and CLI is merged
  Given a UserId appears in both the KIRO_IDE and KIRO_CLI report for a day
  When per-user metrics are computed
  Then that user's counts are the sum of the IDE and CLI rows
  And the user appears only once in per-user listings
```

### US-DATA-05 — Map UserId to email
**Priority**: Must · **Personas**: Maya, Tariel · **Traces**: FR-2.4, A-3, A-4
**Story**: As a viewer, I want users labeled by email so that I can recognize who they are.

```gherkin
Scenario: Build mapping from files that contain User_Email
  Given some report files include a "User_Email" column and others do not
  When the backend builds its UserId -> email mapping
  Then it scans the files that contain User_Email across the bucket
  And it records one email per UserId

Scenario: Fallback when email is unknown
  Given a UserId that never appears in any file containing User_Email
  When the user is displayed
  Then a shortened UserId is shown as the label
```

---

## Epic C — Metrics Engine

### US-METRIC-01 — Compute per-user metrics
**Priority**: Must · **Personas**: Maya, Tariel · **Traces**: FR-3.1, FR-3.4
**Story**: As a viewer, I want per-user metrics for the selected period so that I can assess an
individual's activity.

```gherkin
Scenario: Per-user aggregation over the period
  Given report data for the selected period
  When per-user metrics are computed for a user
  Then I see total messages, total chat conversations, total credits used, active days,
       per-model message breakdown, and subscription tier
```

### US-METRIC-02 — Compute aggregate (all-users) metrics
**Priority**: Must · **Personas**: Maya, Tariel · **Traces**: FR-3.2, FR-3.4
**Story**: As a viewer, I want organization-wide totals and averages so that I understand overall
adoption.

```gherkin
Scenario: Aggregate across all users
  Given report data for the selected period
  When aggregate metrics are computed
  Then I see total messages, total conversations, total credits, active user count,
       and a model-usage distribution across all users
```

### US-METRIC-03 — Configurable AI Adoption weighted score
**Priority**: Must · **Personas**: Tariel, Orkhan · **Traces**: FR-3.3, FR-3.3.1, FR-3.3.2, NFR-4.1
**Story**: As an operator, I want the AI Adoption score computed as a configurable weighted sum so
that the formula can be tuned without code changes.

```gherkin
Scenario: Default weighted sum
  Given the default weights (Total_Messages 0.40, Chat_Conversations 0.30, Credits_Used 0.20, Active_Days 0.10)
  When a user's AI Adoption score is computed
  Then it equals the sum of each metric multiplied by its weight (absolute, not normalized)

Scenario: Weights are configurable
  Given the operator changes the weights in configuration
  When scores are recomputed
  Then the new weights are applied without any code change

Scenario: Missing inputs default to zero
  Given a user is missing one of the input metrics for the period
  When the score is computed
  Then the missing metric contributes zero to the weighted sum
```

---

## Epic D — Main Dashboard Page

### US-MAIN-01 — Switch time range (week/month)
**Priority**: Must · **Personas**: Maya, Tariel · **Traces**: FR-4.1
**Story**: As a viewer, I want to switch the main page between last week and last month so that I
can change the reporting window.

```gherkin
Scenario: Default is last month
  Given I open the main dashboard
  Then the data shown defaults to the last month

Scenario: Switch to last week
  Given I am on the main dashboard
  When I select "last week"
  Then all charts and stats update to reflect the last week
```

### US-MAIN-02 — View aggregate charts and summary cards
**Priority**: Must · **Personas**: Maya, Tariel · **Traces**: FR-4.2
**Story**: As a viewer, I want multiple charts and summary cards of aggregate metrics so that I can
understand adoption at a glance.

```gherkin
Scenario: Aggregate visualizations render
  Given aggregate metrics for the selected period
  When the main dashboard loads
  Then I see summary stat cards and multiple Recharts charts
       (e.g. messages over time, model-usage distribution, credits over time, active users)
```

### US-MAIN-03 — Top-5 by AI Adoption with podium styling
**Priority**: Must · **Personas**: Tariel · **Traces**: FR-4.3
**Story**: As a team lead, I want a Top-5 by AI Adoption block with gold/silver/bronze borders for
the top three so that the best adopters stand out.

```gherkin
Scenario: Top-5 ranking displayed
  Given AI Adoption scores for all users in the period
  When the Top-5 block renders
  Then the five highest-scoring users are listed in descending order, labeled by email when known

Scenario: Podium borders for the top three
  Given the Top-5 block is rendered
  Then the 1st place entry has a gold border
  And the 2nd place entry has a silver border
  And the 3rd place entry has a bronze border
```

### US-MAIN-04 — Reorder dashboard blocks by drag-and-drop
**Priority**: Must · **Personas**: Maya · **Traces**: FR-4.4, FR-4.4.1
**Story**: As a viewer, I want to drag blocks to reorder them so that I can arrange the dashboard to
my preference.

```gherkin
Scenario: Drag to reorder
  Given the main dashboard shows multiple modular blocks
  And a block is not locked
  When I drag it to a new position
  Then the blocks reflow into the new order
```

### US-MAIN-05 — Lock/unlock a block
**Priority**: Must · **Personas**: Maya · **Traces**: FR-4.4.2
**Story**: As a viewer, I want to lock a block via its lock icon so that it can't be moved
accidentally.

```gherkin
Scenario: Locking prevents dragging
  Given a block is unlocked
  When I click its lock icon
  Then the block becomes locked
  And attempting to drag it has no effect

Scenario: Unlocking restores dragging
  Given a block is locked
  When I click its lock icon again
  Then the block becomes unlocked and can be dragged
```

### US-MAIN-06 — Persist dashboard layout
**Priority**: Should · **Personas**: Maya · **Traces**: FR-4.4.3
**Story**: As a viewer, I want my block order and lock states saved so that my layout persists
across sessions.

```gherkin
Scenario: Layout is restored on return
  Given I have reordered and locked some blocks
  When I reload the app or log in again later
  Then my saved block order and lock states are restored
```

---

## Epic E — Individual Metrics Page

### US-IND-01 — Navigate to the individual page via sidebar
**Priority**: Must · **Personas**: Maya, Tariel · **Traces**: FR-5.1, FR-7.1
**Story**: As a viewer, I want a sidebar link to the individual metrics page so that I can switch
views easily.

```gherkin
Scenario: Sidebar navigation
  Given I am anywhere in the app
  When I click the "Individual" item in the sidebar
  Then the individual metrics page opens
```

### US-IND-02 — Select a user with search
**Priority**: Must · **Personas**: Maya, Tariel · **Traces**: FR-5.2
**Story**: As a viewer, I want a searchable user selector so that I can quickly find a specific Kiro
user.

```gherkin
Scenario: Search narrows the user list
  Given the user selector is open
  When I type part of an email or UserId
  Then the list filters to matching users
  And users are labeled by email when known, otherwise a shortened UserId

Scenario: Selecting a user loads their metrics
  Given I have found the user I want
  When I select them
  Then the page shows that user's individual metrics
```

### US-IND-03 — View an individual user's metrics and charts
**Priority**: Must · **Personas**: Maya, Tariel · **Traces**: FR-5.3, FR-3.1
**Story**: As a viewer, I want the selected user's metrics shown with charts so that I can analyze
their activity.

```gherkin
Scenario: Individual metrics render
  Given a user is selected
  When the individual page loads their data for the selected period
  Then I see their per-user metrics with appropriate charts (e.g. messages over time, model breakdown)
```

---

## Epic F — Comparison Page

### US-COMP-01 — Navigate to the comparison page and pick a metric
**Priority**: Must · **Personas**: Tariel · **Traces**: FR-6.1, FR-6.2, FR-7.1
**Story**: As a team lead, I want to open the comparison page and choose a metric so that I can
compare users on that metric.

```gherkin
Scenario: Choose a metric to compare
  Given I open the comparison page from the sidebar
  When I select a metric (e.g. Total Messages, AI Adoption, Credits Used)
  Then the page prepares to compare users on that metric
```

### US-COMP-02 — Select the comparison user set
**Priority**: Must · **Personas**: Tariel · **Traces**: FR-6.3
**Story**: As a team lead, I want to choose which users are compared so that the chart shows the
group I care about.

```gherkin
Scenario: Top N (N capped at 20)
  Given a metric is selected
  When I choose "Top N" and enter N
  Then the chart shows the N highest users for that metric
  And N is limited to a maximum of 20

Scenario: Last (bottom) N
  When I choose "Last N" and enter N (<= 20)
  Then the chart shows the N lowest users for that metric

Scenario: Top-5 and Bottom-5 together
  When I choose "Top-5 and Bottom-5"
  Then the chart shows the five highest and five lowest users together

Scenario: All users
  When I choose "All users"
  Then the chart shows every user for the selected metric
```

### US-COMP-03 — View the comparison chart
**Priority**: Must · **Personas**: Tariel · **Traces**: FR-6.4
**Story**: As a team lead, I want a chart comparing the selected users so that differences are easy
to read.

```gherkin
Scenario: Comparison chart renders
  Given a metric and a user set are selected
  When the comparison runs
  Then a chart (e.g. bar chart) displays the chosen metric across the selected users
  And users are labeled by email when known
```

---

## Epic G — Near-Real-Time & Navigation (NFR-driven)

### US-NRT-01 — Auto-refresh dashboard data
**Priority**: Must · **Personas**: Maya, Tariel · **Traces**: NFR-2.1, FR-2.6
**Story**: As a viewer, I want the dashboard to auto-refresh every few minutes so that I see new S3
data without manual reloads.

```gherkin
Scenario: Periodic refresh
  Given I am viewing the dashboard
  When the configured refresh interval elapses
  Then the app re-checks S3 for new or updated files and updates the visualizations

Scenario: Responsive reads via caching
  Given data for the period was recently fetched
  When I navigate or refresh within the cache TTL
  Then results return quickly from cache rather than re-downloading everything
```

### US-NAV-01 — Persistent sidebar navigation
**Priority**: Must · **Personas**: Maya, Tariel · **Traces**: FR-7.1
**Story**: As a viewer, I want a persistent sidebar so that I can move between Main, Individual, and
Comparison pages.

```gherkin
Scenario: Sidebar is always available
  Given I am logged in
  When I view any page
  Then a sidebar shows links to Main, Individual, and Comparison
  And the active page is highlighted
```

---

## Epic H — Styling, Deployment & Quality (NFR stories)

### US-NFR-01 — Kiro IDE-like styling
**Priority**: Must · **Personas**: Maya, Tariel · **Traces**: NFR-1.1, NFR-1.2
**Story**: As a viewer, I want the app to look like the Kiro IDE so that it feels familiar and
cohesive.

```gherkin
Scenario: Kiro-like theme applied
  Given I use the app
  Then it presents a dark, Kiro-style theme (palette, typography, accent colors) via shared design tokens
  And the layout is usable on typical desktop screen sizes
```

### US-NFR-02 — Accessible UI
**Priority**: Should · **Personas**: Maya, Tariel · **Traces**: NFR-1.3
**Story**: As a viewer, I want accessible controls so that I can use the app via keyboard and read
it comfortably.

```gherkin
Scenario: Keyboard and contrast
  Given I navigate with a keyboard
  Then interactive controls are reachable and operable
  And key elements have sufficient color contrast and ARIA labels where practical
```

### US-NFR-03 — Deploy via Docker Compose
**Priority**: Must · **Personas**: Orkhan · **Traces**: NFR-5.1, NFR-5.2
**Story**: As an operator, I want to run the whole app with Docker Compose so that deployment is one
command.

```gherkin
Scenario: One-command startup
  Given a valid .env with AWS credentials
  When I run "docker compose up"
  Then the backend and frontend services start and the dashboard is reachable
  And credentials are passed via environment, never baked into images
```

### US-NFR-04 — Configurable refresh interval and weights
**Priority**: Should · **Personas**: Orkhan · **Traces**: NFR-4.1
**Story**: As an operator, I want the refresh interval and AI Adoption weights configurable so that
I can tune behavior without code changes.

```gherkin
Scenario: Configuration takes effect
  Given I change the refresh interval and/or AI Adoption weights in configuration
  When the app restarts (or reloads config)
  Then the new interval and weights are used
```

### US-NFR-05 — Resilient ingestion
**Priority**: Must · **Personas**: Orkhan · **Traces**: NFR-3.1, NFR-3.2
**Story**: As an operator, I want ingestion to degrade gracefully so that bad/missing data or S3
errors don't crash the app.

```gherkin
Scenario: Graceful handling of problems
  Given a missing file, an absent column, or an S3 access error
  When ingestion runs
  Then the system skips/zero-defaults where appropriate and logs a warning
  And surfaces a clear, non-sensitive error message to the API when it cannot proceed
```

### US-NFR-06 — Property-based test coverage of core logic
**Priority**: Must · **Personas**: Orkhan · **Traces**: NFR-6.1, NFR-6.2, NFR-6.3
**Story**: As an operator, I want core logic covered by property-based tests so that edge cases in
parsing and metric computation are caught.

```gherkin
Scenario: PBT for metrics and parsing
  Given the metrics engine and CSV parser
  When the test suite runs
  Then property-based tests (Hypothesis backend, fast-check frontend) verify invariants such as:
       weighted-sum monotonicity, IDE+CLI combination correctness, dynamic-parse round-trips,
       and top/bottom-N selection properties
  And tests support shrinking and seed-based reproducibility in CI
```

---

## Traceability Matrix (Requirement → Stories)

| Requirement | Covered by |
|---|---|
| FR-1.1 / FR-1.3 / FR-1.6 | US-AUTH-01 |
| FR-1.2 / FR-1.4 | US-AUTH-02 |
| FR-1.4 / FR-1.5 / FR-7.2 | US-AUTH-03 |
| FR-1.7 | US-AUTH-04 |
| FR-2.1 | US-DATA-01 |
| FR-2.2 | US-DATA-02 |
| FR-2.3 | US-DATA-03 |
| FR-2.5 | US-DATA-04 |
| FR-2.4 | US-DATA-05 |
| FR-2.6 | US-DATA-04, US-NRT-01 |
| FR-3.1 | US-METRIC-01, US-IND-03 |
| FR-3.2 | US-METRIC-02 |
| FR-3.3 (+.1/.2) | US-METRIC-03 |
| FR-3.4 | US-METRIC-01, US-METRIC-02, US-MAIN-01 |
| FR-4.1 | US-MAIN-01 |
| FR-4.2 | US-MAIN-02 |
| FR-4.3 | US-MAIN-03 |
| FR-4.4 (+.1/.2/.3) | US-MAIN-04, US-MAIN-05, US-MAIN-06 |
| FR-5.1 | US-IND-01 |
| FR-5.2 | US-IND-02 |
| FR-5.3 | US-IND-03 |
| FR-6.1 / FR-6.2 | US-COMP-01 |
| FR-6.3 | US-COMP-02 |
| FR-6.4 | US-COMP-03 |
| FR-7.1 | US-NAV-01, US-IND-01, US-COMP-01 |
| FR-7.2 | US-AUTH-03 |
| NFR-1.1 / NFR-1.2 | US-NFR-01 |
| NFR-1.3 | US-NFR-02 |
| NFR-2.1 / NFR-2.2 | US-NRT-01 |
| NFR-3.1 / NFR-3.2 | US-DATA-03, US-NFR-05 |
| NFR-4.1 | US-METRIC-03, US-NFR-04 |
| NFR-4.2 | US-DATA-01 |
| NFR-5.1 / NFR-5.2 | US-NFR-03 |
| NFR-6.1 / NFR-6.2 / NFR-6.3 | US-NFR-06 |

**Coverage check**: Every FR and NFR in `requirements.md` maps to at least one story. ✅
