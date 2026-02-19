---
name: uber-go-guide
description: Enforce Uber Go Style Guide conventions when writing or modifying Go code. Load this skill for ANY Go project changes to ensure production-quality code.
license: MIT
metadata:
  audience: developers
  workflow: code-quality
---

## What I do

I enforce the [Uber Go Style Guide](https://github.com/uber-go/guide) when writing or modifying Go code. This ensures consistent, production-quality Go code following battle-tested conventions used at Uber and widely adopted across the Go community.

## When to use me

- Writing new Go code (files, functions, types, tests)
- Modifying existing Go code
- Reviewing Go code for quality
- Any task involving `.go` files

## Rules

You MUST follow ALL rules below when writing or modifying Go code. These are NOT suggestions — they are mandatory conventions.

---

### 1. Error Handling

#### 1.1 Handle errors once
- Do NOT log an error AND return it. Pick one.
- If returning: wrap with context using `fmt.Errorf("context: %w", err)` or the project's error wrapping package.
- If handling: log and degrade gracefully.

```go
// BAD: handles error twice
u, err := getUser(id)
if err != nil {
  log.Printf("Could not get user %q: %v", id, err)
  return err
}

// GOOD: wrap and return
u, err := getUser(id)
if err != nil {
  return fmt.Errorf("get user %q: %w", id, err)
}
```

#### 1.2 Error wrapping context
- Keep context succinct. Avoid "failed to" prefixes — they pile up.
- Use `%w` when callers should match the error, `%v` to obfuscate.

```go
// BAD
return fmt.Errorf("failed to create new store: %w", err)

// GOOD
return fmt.Errorf("new store: %w", err)
```

#### 1.3 Error naming
- Exported sentinel errors: `ErrXxx` prefix (e.g., `ErrNotFound`)
- Unexported sentinel errors: `errXxx` prefix (e.g., `errNotFound`)
- Custom error types: `XxxError` suffix (e.g., `NotFoundError`)

#### 1.4 Use errors.Is / errors.As
- NEVER compare errors with `==`. Use `errors.Is(err, target)` or `errors.As(err, &target)`.

#### 1.5 Check project error package first
- Before using `fmt.Errorf`, check if the project has its own errors package (`internal/errors`, `pkg/errors`, or `errors` directory). If so, use that instead.

---

### 2. Don't Panic

#### 2.1 No panic in library code
- `panic()` is ONLY acceptable in `main()` or `init()` for truly irrecoverable situations (e.g., `template.Must()`).
- All other functions MUST return errors instead of panicking.

#### 2.2 Tests: use t.Fatal, not panic
- In tests, use `t.Fatal()` or `t.FailNow()` instead of `panic()`.

---

### 3. Type Assertions

#### 3.1 Always use comma-ok form
- NEVER use single-return type assertions — they panic on failure.

```go
// BAD: panics if i is not a string
t := i.(string)

// GOOD: handles gracefully
t, ok := i.(string)
if !ok {
  // handle error
}
```

---

### 4. Goroutines

#### 4.1 No fire-and-forget goroutines
- Every goroutine MUST have a predictable way to stop and be waited on.
- Use `sync.WaitGroup`, done channels, or context cancellation.

```go
// BAD: no way to stop or wait
go func() {
  for {
    flush()
    time.Sleep(delay)
  }
}()

// GOOD: controllable lifecycle
var (
  stop = make(chan struct{})
  done = make(chan struct{})
)
go func() {
  defer close(done)
  ticker := time.NewTicker(delay)
  defer ticker.Stop()
  for {
    select {
    case <-ticker.C:
      flush()
    case <-stop:
      return
    }
  }
}()
```

#### 4.2 No goroutines in init()
- `init()` functions MUST NOT spawn goroutines. Use explicit lifecycle objects instead.

---

### 5. Avoid init()

- Avoid `init()` where possible. Code should be deterministic and not depend on init ordering.
- If a value can be computed as a `var` assignment or a helper function, prefer that over `init()`.
- Acceptable uses: `database/sql` driver registration, `template.Must()`, encoding type registries.

---

### 6. Mutexes

#### 6.1 Zero-value mutexes are valid
- Use `var mu sync.Mutex` directly, not `mu := new(sync.Mutex)`.

#### 6.2 Never embed mutexes
- Do NOT embed `sync.Mutex` or `sync.RWMutex` in structs. Use a named field instead.

```go
// BAD: exposes Lock/Unlock as API
type SMap struct {
  sync.Mutex
  data map[string]string
}

// GOOD: mutex is an implementation detail
type SMap struct {
  mu   sync.Mutex
  data map[string]string
}
```

---

### 7. Avoid Mutable Globals

- Do NOT use mutable global variables. Use dependency injection instead.
- Function pointers at package level are mutable globals too.

---

### 8. Channel Size

- Channels should have a size of **one or zero** (unbuffered). Any other size requires strong justification.

---

### 9. Enums

- Start enums at **one** (`iota + 1`), not zero, unless the zero value has a meaningful default.

```go
// GOOD
const (
  Add Operation = iota + 1
  Subtract
  Multiply
)
```

---

### 10. Exit in Main

- Call `os.Exit` or `log.Fatal` ONLY in `main()`. All other functions must return errors.
- Prefer a single exit point: extract logic into a `run() error` function.

```go
func main() {
  if err := run(); err != nil {
    log.Fatal(err)
  }
}

func run() error {
  // all business logic here
}
```

---

### 11. Embedding

#### 11.1 Avoid embedding types in public structs
- Embedding leaks implementation details and inhibits type evolution.
- Use named fields and explicit delegation methods instead.

#### 11.2 Embedding position
- If embedding is used, embedded types go at the TOP of the field list with an empty line separating them from regular fields.

---

### 12. Interface Compliance

- Verify interface compliance at compile time with blank identifier assignments:

```go
var _ http.Handler = (*Handler)(nil)
var _ io.Reader = LogHandler{}
```

---

### 13. Struct Tags

- ALL struct fields that are marshaled (JSON, YAML, etc.) MUST have explicit tags.

```go
type Stock struct {
  Price int    `json:"price"`
  Name  string `json:"name"`
}
```

---

### 14. Naming

#### 14.1 Package names
- All lower-case, no underscores, no capitals.
- Short and succinct. Not plural.
- NEVER use `common`, `util`, `shared`, `lib`, `base`, `helpers`.

#### 14.2 Unexported globals
- Prefix unexported top-level `var` and `const` with `_` (e.g., `_defaultPort`).
- Exception: error sentinels use `err` prefix without underscore.

#### 14.3 Avoid built-in name shadowing
- NEVER use `error`, `string`, `int`, `len`, `cap`, `new`, `make`, `copy`, `close`, `delete`, `append`, `panic`, `recover`, `print`, `println`, `true`, `false`, `nil`, `iota` as variable/parameter/field names.

---

### 15. Imports

#### 15.1 Two groups
- Group 1: Standard library
- Group 2: Everything else
- Separated by a blank line.

#### 15.2 No unnecessary aliases
- Only alias imports when the package name conflicts or doesn't match the last path element.

---

### 16. Variable Declarations

#### 16.1 Top-level
- Use `var` keyword. Don't specify type if it matches the expression's return type.

#### 16.2 Local
- Use `:=` short declaration for explicit values.
- Use `var` for zero-value declarations (especially slices).

#### 16.3 nil slices
- `nil` is a valid slice. Use `var s []T` not `s := []T{}`.
- Check emptiness with `len(s) == 0`, not `s == nil`.

---

### 17. Reduce Nesting

- Handle error/special cases first, return early.
- Avoid `else` when the `if` block ends with `return`/`continue`/`break`.

---

### 18. Performance (Hot Paths)

#### 18.1 Prefer strconv over fmt
- Use `strconv.Itoa()`, `strconv.FormatFloat()` etc. instead of `fmt.Sprint()` for primitive conversions.

#### 18.2 Specify container capacity
- Always provide capacity hints for `make([]T, 0, cap)` and `make(map[K]V, cap)` when the size is known or estimatable.

#### 18.3 Avoid repeated string-to-byte conversions
- Convert `[]byte("constant string")` once outside loops.

---

### 19. Testing

#### 19.1 Table-driven tests
- Use table-driven tests with subtests for repetitive test logic.
- Name the slice `tests`, each case `tt`.
- Use `give` and `want` prefixes for input/output fields.

#### 19.2 Keep table tests simple
- If subtests need conditional logic or complex branching, split into separate test functions.

#### 19.3 Parallel tests
- When using `t.Parallel()`, ensure loop variables are properly scoped.

---

### 20. Functional Options

- For constructors with 3+ optional parameters, use the functional options pattern.
- Use an `Option` interface with an unexported `apply(*options)` method.

---

### 21. Struct Initialization

- ALWAYS use field names when initializing structs (exception: test tables with ≤3 fields).
- Omit zero-value fields unless they provide meaningful context.
- Use `var s T` for zero-value structs, not `s := T{}`.
- Use `&T{...}` not `new(T)` for struct references.

---

### 22. Maps

- Use `make(map[K]V)` for empty maps, not `map[K]V{}`.
- Use map literals only for fixed element sets.

---

### 23. Copy Slices and Maps at Boundaries

- When receiving slices/maps as arguments and storing them, make a copy.
- When returning internal slices/maps, return a copy.
- This prevents callers from mutating internal state.

---

### 24. Defer for Cleanup

- Use `defer` to clean up resources (files, locks, connections).
- The tiny overhead of defer is worth the readability and safety.

---

### 25. Format Strings

- If format strings for Printf-style functions are declared outside the call, make them `const`.
- Printf-style function names should end with `f` (e.g., `Wrapf`, `Logf`).

---

### 26. Linting

- Code should pass `errcheck`, `govet`, `staticcheck`, `revive`, and `goimports`.
- Use `golangci-lint` as the lint runner.

---

## Quick Reference Checklist

Before completing any Go code change, verify:

- [ ] Errors are handled once (not logged AND returned)
- [ ] Error context is succinct (no "failed to" prefix chains)
- [ ] No `panic()` outside main/init
- [ ] Type assertions use comma-ok form
- [ ] Goroutines have controlled lifecycles
- [ ] No `init()` unless absolutely necessary
- [ ] Mutexes are named fields, not embedded
- [ ] No mutable global variables
- [ ] Channel buffers are 0 or 1
- [ ] Struct fields have marshaling tags where needed
- [ ] Imports are grouped (stdlib / third-party)
- [ ] Container capacities are specified where known
- [ ] Tests are table-driven where appropriate
- [ ] `var` used for zero-value slices (not `[]T{}`)
- [ ] Struct init uses field names
