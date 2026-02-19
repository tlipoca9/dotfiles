---
name: go-delegator
description: Enforce the Delegator pattern in Go — wrap dependencies with explicit method forwarding instead of struct embedding. Load this skill when designing Go interfaces, services, or adapters.
license: MIT
metadata:
  audience: developers
  workflow: code-quality
---

## What I do

I enforce the **Delegator pattern** in Go: structs hold dependencies as named fields and explicitly forward method calls, rather than embedding types which leaks their full API surface. This produces clean, intentional interfaces where every exported method is a conscious design choice.

## When to use me

- Designing new Go types that wrap or compose other types
- Refactoring embedded structs into explicit delegation
- Building adapters, decorators, middleware, or service layers
- Any Go code where one type "has-a" relationship with another

## Why Delegator over Embedding

Embedding in Go promotes ALL methods of the embedded type to the outer type. This is dangerous because:

1. **API leak** — callers get access to methods you didn't intend to expose
2. **Brittle evolution** — adding methods to the embedded type silently changes your API
3. **Unclear intent** — readers can't tell which methods are intentional API vs inherited noise
4. **Interface pollution** — the outer type may accidentally satisfy interfaces you don't want

The Delegator pattern makes every method call explicit, giving you full control over your type's API surface.

## Rules

### 1. NEVER embed types to reuse their methods

Embedding is only acceptable for:
- Satisfying an interface with a no-op or default implementation (e.g., `testing.TB`)
- `sync.Mutex` as an **unexported named field** (`mu sync.Mutex`, NOT embedded)
- Truly private internal types that will never be exposed

For everything else, use a named field and delegate explicitly.

```go
// BAD: embedding leaks all of DB's methods
type UserStore struct {
    *sql.DB
}

// GOOD: explicit delegation, controlled API
type UserStore struct {
    db *sql.DB
}

func (s *UserStore) GetUser(ctx context.Context, id string) (*User, error) {
    return scanUser(s.db.QueryRowContext(ctx, "SELECT ... WHERE id = $1", id))
}

func (s *UserStore) Close() error {
    return s.db.Close()
}
```

### 2. Keep the delegate field unexported

The inner dependency should be an implementation detail, not part of your public API.

```go
// BAD: exposes the delegate
type Service struct {
    Logger *zap.Logger
    Cache  redis.Client
}

// GOOD: hides the delegate
type Service struct {
    logger *zap.Logger
    cache  redis.Client
}
```

### 3. Forward only what you need

Don't blindly forward all methods. Each forwarded method is a conscious API decision.

```go
// BAD: forwarding everything defeats the purpose
func (s *Service) Debug(msg string, fields ...zap.Field) { s.logger.Debug(msg, fields...) }
func (s *Service) Info(msg string, fields ...zap.Field)  { s.logger.Info(msg, fields...) }
func (s *Service) Warn(msg string, fields ...zap.Field)  { s.logger.Warn(msg, fields...) }
func (s *Service) Error(msg string, fields ...zap.Field) { s.logger.Error(msg, fields...) }
func (s *Service) DPanic(msg string, fields ...zap.Field) { s.logger.DPanic(msg, fields...) }
func (s *Service) Panic(msg string, fields ...zap.Field) { s.logger.Panic(msg, fields...) }
func (s *Service) Fatal(msg string, fields ...zap.Field) { s.logger.Fatal(msg, fields...) }

// GOOD: Service uses the logger internally, doesn't re-expose it
type Service struct {
    logger *zap.Logger
}

func (s *Service) Process(ctx context.Context, req Request) error {
    s.logger.Info("processing request", zap.String("id", req.ID))
    // ...
}
```

### 4. Use interfaces at boundaries, not concrete types

Define small interfaces for what you need from the delegate. This makes testing easy and decouples from the concrete implementation.

```go
// GOOD: depend on behavior, not implementation
type UserRepository interface {
    GetUser(ctx context.Context, id string) (*User, error)
    SaveUser(ctx context.Context, user *User) error
}

type UserService struct {
    repo UserRepository
}

func NewUserService(repo UserRepository) *UserService {
    return &UserService{repo: repo}
}
```

### 5. Constructor enforces dependencies

Use a constructor function to make dependencies explicit and validate them.

```go
func NewOrderService(
    repo OrderRepository,
    payments PaymentGateway,
    logger *zap.Logger,
) (*OrderService, error) {
    if repo == nil {
        return nil, errors.New("order repository is required")
    }
    if payments == nil {
        return nil, errors.New("payment gateway is required")
    }
    if logger == nil {
        logger = zap.NewNop()
    }
    return &OrderService{
        repo:     repo,
        payments: payments,
        logger:   logger,
    }, nil
}
```

### 6. Decorator / Middleware pattern with delegation

When wrapping an interface implementation, hold the inner implementation as a field and forward calls with added behavior.

```go
// Interface
type Cache interface {
    Get(ctx context.Context, key string) ([]byte, error)
    Set(ctx context.Context, key string, val []byte, ttl time.Duration) error
}

// Decorator adds metrics
type instrumentedCache struct {
    inner   Cache
    metrics *prometheus.CounterVec
}

func NewInstrumentedCache(inner Cache, metrics *prometheus.CounterVec) Cache {
    return &instrumentedCache{inner: inner, metrics: metrics}
}

func (c *instrumentedCache) Get(ctx context.Context, key string) ([]byte, error) {
    c.metrics.WithLabelValues("get").Inc()
    return c.inner.Get(ctx, key)
}

func (c *instrumentedCache) Set(ctx context.Context, key string, val []byte, ttl time.Duration) error {
    c.metrics.WithLabelValues("set").Inc()
    return c.inner.Set(ctx, key, val, ttl)
}
```

### 7. Adapter pattern with delegation

When adapting one interface to another, the delegator translates method signatures.

```go
// External SDK type
type ThirdPartyMailer struct { /* ... */ }
func (m *ThirdPartyMailer) Dispatch(to, subject, html string) error { /* ... */ }

// Our interface
type Notifier interface {
    Notify(ctx context.Context, recipient string, msg Message) error
}

// Adapter delegates to the SDK
type emailNotifier struct {
    mailer *ThirdPartyMailer
}

func NewEmailNotifier(mailer *ThirdPartyMailer) Notifier {
    return &emailNotifier{mailer: mailer}
}

func (n *emailNotifier) Notify(ctx context.Context, recipient string, msg Message) error {
    html := renderTemplate(msg)
    return n.mailer.Dispatch(recipient, msg.Subject, html)
}
```

## Quick Reference Checklist

Before completing any Go code that composes types, verify:

- [ ] No type embedding for method reuse (use named fields + explicit delegation)
- [ ] Delegate fields are unexported
- [ ] Only necessary methods are forwarded — no blanket forwarding
- [ ] Interfaces are small and defined at the consumer, not the provider
- [ ] Constructor validates required dependencies
- [ ] Decorators hold the inner implementation as a field, return the interface
- [ ] Adapters translate between interface boundaries cleanly
