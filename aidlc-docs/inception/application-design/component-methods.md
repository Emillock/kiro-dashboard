# Component Methods — Kiro NRT Dashboard

Method signatures with high-level purpose and I/O types. Detailed business rules are deferred to the
Code Generation plan (Functional Design was skipped). Signatures use Python-style type hints for the
backend and TypeScript for the frontend.

---

## Backend

### BE-1 Config — `Settings`
```python
class Settings(BaseSettings):
    aws_access_key_id: str
    aws_secret_access_key: str
    aws_default_region: str = "us-east-1"
    s3_bucket: str = "example-kiro-activity-bucket"
    s3_base_prefix: str = "AWSLogs/000000000000/KiroLogs/user_report/us-east-1/"
    cache_ttl_seconds: int = 300            # short TTL for metric data
    email_map_ttl_seconds: int = 86400      # longer TTL for email mapping
    refresh_interval_seconds: int = 180     # NRT polling hint for frontend
    adoption_weights: dict[str, float] = {"total_messages": 0.40,
                                          "chat_conversations": 0.30,
                                          "credits_used": 0.20,
                                          "active_days": 0.10}
    jwt_secret: str
    jwt_expiry_minutes: int = 720
```

### BE-2 Auth
```python
def hash_password(plain: str) -> str: ...
def verify_password(plain: str, hashed: str) -> bool: ...
def create_access_token(user_id: int, email: str) -> str: ...
def decode_access_token(token: str) -> TokenData: ...
# FastAPI dependency
def get_current_user(token: str = Depends(oauth2_scheme)) -> UserRecord: ...
```

### BE-3 S3 Ingestion Client
```python
def list_report_keys(start: date, end: date) -> list[str]:
    """All KIRO_IDE/KIRO_CLI CSV keys for days in [start, end]; missing days skipped."""
def fetch_object_text(key: str) -> str:
    """Download an object and decode (utf-8-sig)."""
def list_all_keys() -> list[str]:
    """All report CSV keys in the bucket (used for email-map scan)."""
```

### BE-4 CSV Parser
```python
@dataclass
class UsageRecord:
    date: date
    user_id: str
    client_type: str            # KIRO_IDE | KIRO_CLI
    chat_conversations: int
    credits_used: float
    total_messages: int
    subscription_tier: str | None
    overage_credits_used: float
    model_messages: dict[str, int]   # discovered *_messages columns
    user_email: str | None           # present only in some files
    new_user: bool | None

def parse_report(csv_text: str) -> list[UsageRecord]:
    """Parse one CSV; read stable core cols, discover *_messages dynamically,
    default missing to 0, ignore unknown columns."""

def discover_message_columns(header: list[str]) -> list[str]:
    """Return column names treated as per-model/mode message counts."""
```

### BE-5 Email Mapping
```python
def build_email_map() -> dict[str, str]:
    """Scan files containing User_Email; return {user_id: email} (one per user)."""
def resolve_label(user_id: str, email_map: dict[str, str]) -> str:
    """Return email if known, else shortened user_id (first 8 chars + ellipsis)."""
```

### BE-6 Metrics Engine
```python
@dataclass
class UserMetrics:
    user_id: str
    label: str
    total_messages: int
    chat_conversations: int
    credits_used: float
    active_days: int
    model_messages: dict[str, int]
    subscription_tier: str | None
    adoption_score: float            # filled by BE-7

def combine_records(records: list[UsageRecord]) -> dict[str, list[UsageRecord]]:
    """Group by user_id (IDE + CLI together)."""
def compute_user_metrics(records: list[UsageRecord]) -> list[UserMetrics]:
    """Per-user aggregation over the period; active_day = messages>0 or convos>0."""
def compute_aggregate_metrics(user_metrics: list[UserMetrics],
                              records: list[UsageRecord]) -> AggregateMetrics:
    """Totals/averages, active user count, model-usage distribution, time series."""
```

### BE-7 AI Adoption Calculator
```python
def adoption_score(m: UserMetrics, weights: dict[str, float]) -> float:
    """Absolute weighted sum; missing metric contributes 0."""
def apply_scores(user_metrics: list[UserMetrics], weights: dict[str, float]) -> list[UserMetrics]:
    """Attach adoption_score to each user."""
```

### BE-8 Ranking/Selection
```python
MetricKey = Literal["adoption_score","total_messages","chat_conversations",
                    "credits_used","active_days"]
SelectionMode = Literal["top_n","bottom_n","top5_bottom5","all"]

def select_users(users: list[UserMetrics], metric: MetricKey,
                 mode: SelectionMode, n: int | None = None) -> list[UserMetrics]:
    """Ordered selection; n clamped to <= 20 for top_n/bottom_n."""
def top_adopters(users: list[UserMetrics], k: int = 5) -> list[UserMetrics]:
    """Top-k by adoption_score for the main-page podium."""
```

### BE-9 Cache
```python
def cache_get(key: str) -> Any | None: ...
def cache_set(key: str, value: Any, ttl_seconds: int) -> None: ...
def cache_invalidate(prefix: str | None = None) -> None: ...
def make_key(*parts: str) -> str: ...
```

### BE-10 Repositories
```python
class UserRepository:
    def create(self, email: str, username: str, password_hash: str) -> UserRecord: ...
    def get_by_email(self, email: str) -> UserRecord | None: ...
    def get_by_username(self, username: str) -> UserRecord | None: ...
    def get_by_id(self, user_id: int) -> UserRecord | None: ...

class CacheRepository:
    def read(self, key: str) -> CacheRow | None: ...
    def write(self, key: str, value_json: str, expires_at: datetime) -> None: ...
    def purge_expired(self) -> int: ...
```

---

## Frontend (TypeScript)

### FE-3 API Client
```typescript
function setToken(token: string | null): void;
async function register(input: {email: string; username: string; password: string}): Promise<void>;
async function login(input: {email: string; password: string}): Promise<{access_token: string}>;
async function getAggregateMetrics(range: "week" | "month"): Promise<AggregateMetrics>;
async function getUserMetrics(range: "week" | "month", userId: string): Promise<UserMetrics>;
async function listUsers(range: "week" | "month"): Promise<UserSummary[]>;
async function getComparison(metric: MetricKey, mode: SelectionMode, n?: number,
                             range?: "week" | "month"): Promise<UserMetrics[]>;
```

### FE-4 Query Hooks (TanStack Query)
```typescript
function useAggregateMetrics(range): UseQueryResult<AggregateMetrics>; // refetchInterval = refresh
function useUserMetrics(range, userId): UseQueryResult<UserMetrics>;
function useUsers(range): UseQueryResult<UserSummary[]>;
function useComparison(metric, mode, n, range): UseQueryResult<UserMetrics[]>;
```

### FE-9 Layout Persistence (localStorage)
```typescript
type BlockState = { id: string; order: number; locked: boolean };
function loadLayout(): BlockState[];          // returns default if none stored
function saveLayout(blocks: BlockState[]): void;
function resetLayout(): void;
```

### FE-5 Dashboard interactions
```typescript
function onReorderBlocks(from: number, to: number): void;   // ignored if target locked
function toggleLock(blockId: string): void;
```
