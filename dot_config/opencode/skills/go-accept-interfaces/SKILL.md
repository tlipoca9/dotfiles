---
name: go-accept-interfaces
description: Enforce "Accept interfaces, return structs" in Go — function parameters should be interfaces, return types should be concrete. Load this skill for ANY Go API/package design.
license: MIT
metadata:
  audience: developers
  workflow: code-quality
---

## What I do

I enforce the Go proverb **"Accept interfaces, return structs"**: functions and methods should accept interface parameters (the narrowest behavior they need) and return concrete struct types (giving callers full value). This produces flexible, testable, loosely-coupled code.

## When to use me

- Designing function/method signatures in Go
- Defining package-level APIs and constructors
- Reviewing Go code for coupling and testability
- Building libraries or shared packages

## Why This Matters

**Accepting interfaces** means:
- Callers can pass any type that satisfies the contract — maximum flexibility
- Functions are testable with mocks/fakes without import cycles
- Dependencies point inward (consumer defines the interface), not outward

**Returning structs** means:
- Callers get the full concrete type with all its methods — no information hiding at the return site
- No premature abstraction — the caller decides if/when to abstract
- Adding methods to the struct doesn't break anything (interfaces are satisfied implicitly)

## Rules

### 1. Function parameters: accept interfaces

Define the minimal interface your function actually needs. If you only call `Read`, accept `io.Reader`, not `*os.File`.

```go
// BAD: coupled to concrete type
func ProcessData(f *os.File) error {
    buf := make([]byte, 1024)
    _, err := f.Read(buf)
    // ...
}

// GOOD: accepts any reader
func ProcessData(r io.Reader) error {
    buf := make([]byte, 1024)
    _, err := r.Read(buf)
    // ...
}
```

### 2. Return types: return concrete structs

Return the concrete type from constructors and factory functions. Let the caller decide whether to store it as an interface.

```go
// BAD: returning interface hides capabilities and forces premature abstraction
func NewUserService(repo UserRepository) UserServiceInterface {
    return &UserService{repo: repo}
}

// GOOD: return the concrete type
func NewUserService(repo UserRepository) *UserService {
    return &UserService{repo: repo}
}
```

### 3. Define interfaces at the consumer, not the provider

The package that **uses** a dependency should define the interface it needs. The package that **implements** the behavior should return a concrete struct.

```go
// BAD: provider package defines the interface
// package database
type Repository interface {  // provider defines this — too broad, too coupled
    GetUser(ctx context.Context, id string) (*User, error)
    SaveUser(ctx context.Context, user *User) error
    DeleteUser(ctx context.Context, id string) error
    ListUsers(ctx context.Context) ([]*User, error)
}

// GOOD: consumer package defines only what it needs
// package orderservice
type UserGetter interface {  // consumer defines this — minimal
    GetUser(ctx context.Context, id string) (*User, error)
}

type OrderService struct {
    users UserGetter
}
```

### 4. Keep interfaces small (1–3 methods)

The Go standard library leads by example: `io.Reader` (1 method), `io.Writer` (1 method), `fmt.Stringer` (1 method). The bigger the interface, the weaker the abstraction.

```go
// BAD: kitchen-sink interface
type DataStore interface {
    Get(key string) ([]byte, error)
    Set(key string, val []byte) error
    Delete(key string) error
    List(prefix string) ([]string, error)
    Watch(key string) <-chan Event
    Close() error
    Stats() StoreStats
}

// GOOD: compose from small interfaces
type Reader interface {
    Get(key string) ([]byte, error)
}

type Writer interface {
    Set(key string, val []byte) error
}

type ReadWriter interface {
    Reader
    Writer
}
```

### 5. Don't return interfaces to hide implementation

Returning an interface from a constructor is almost always wrong. Common violations:

```go
// BAD: hides the concrete type behind an interface for no reason
func NewCache() Cacher { return &memoryCache{} }

// BAD: returning error-wrapping interface
func NewClient() ClientInterface { return &client{} }

// GOOD: return the struct, let the caller abstract if needed
func NewCache() *MemoryCache { return &MemoryCache{} }
func NewClient() *Client { return &Client{} }
```

**Exceptions** where returning an interface is acceptable:
- Factory functions that select between implementations at runtime (`func NewStore(driver string) Store`)
- The returned type is intentionally opaque and internal (unexported struct satisfying exported interface)
- Standard library patterns: `errors.New` returns `error`, `context.WithCancel` returns `context.Context`

### 6. Don't accept concrete types to "keep it simple"

Using concrete types in parameters feels simpler but creates tight coupling and blocks testing.

```go
// BAD: can't test without a real database
func CreateOrder(db *sql.DB, order Order) error {
    _, err := db.ExecContext(ctx, "INSERT ...", order.ID, order.Total)
    return err
}

// GOOD: testable with any implementation
type OrderSaver interface {
    SaveOrder(ctx context.Context, order Order) error
}

func CreateOrder(ctx context.Context, saver OrderSaver, order Order) error {
    return saver.SaveOrder(ctx, order)
}
```

### 7. Standard library interfaces first

Before defining custom interfaces, check if a standard library interface fits:

| Need | Use |
|------|-----|
| Read bytes | `io.Reader` |
| Write bytes | `io.Writer` |
| Close resource | `io.Closer` |
| Read + Close | `io.ReadCloser` |
| String representation | `fmt.Stringer` |
| Error value | `error` |
| HTTP handling | `http.Handler` |
| Sort collection | `sort.Interface` |
| Marshal/Unmarshal | `encoding.TextMarshaler`, `json.Marshaler` |
| Context propagation | `context.Context` (concrete, but designed as parameter type) |

```go
// BAD: reinventing io.Writer
type DataWriter interface {
    WriteData(data []byte) (int, error)
}

// GOOD: use the stdlib
func Export(w io.Writer) error {
    _, err := w.Write(data)
    return err
}
```

### 8. Avoid empty interface (`any`) as parameter type

`any` / `interface{}` accepts everything and communicates nothing. If you reach for `any`, you probably need a type parameter (generics) or a more specific interface.

```go
// BAD: no contract
func Process(data any) error { /* ... */ }

// GOOD: explicit contract
func Process(data Processable) error { /* ... */ }

// GOOD: generics when the operation is truly type-agnostic
func Map[T, U any](slice []T, fn func(T) U) []U { /* ... */ }
```

## Quick Reference Checklist

Before completing any Go function/method signature, verify:

- [ ] Parameters use interfaces, not concrete types (unless primitive/stdlib)
- [ ] Return types are concrete structs, not interfaces (unless factory selecting implementations)
- [ ] Interfaces are defined at the consumer, not the provider
- [ ] Each interface has 1–3 methods (compose larger ones from small ones)
- [ ] Standard library interfaces are used when they fit
- [ ] No `any` / `interface{}` parameters without strong justification
- [ ] Constructors return `*ConcreteType`, not `SomeInterface`
