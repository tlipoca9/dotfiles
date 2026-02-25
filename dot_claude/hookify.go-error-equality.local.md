---
name: go-error-equality
enabled: true
event: file
action: block
conditions:
  - field: file_path
    operator: regex_match
    pattern: \.go$
  - field: new_text
    operator: regex_match
    pattern: \berr\s*[!=]=\s*Err\w+|\bErr\w+\s*[!=]=\s*err\b
---

**Direct error comparison (`==` / `!=`) detected**

Per the Uber Go Style Guide, never compare errors with `==` or `!=`.
Use `errors.Is()` or `errors.As()` instead, which correctly handle wrapped errors.

```go
// BAD
if err == ErrNotFound {

// GOOD
if errors.Is(err, ErrNotFound) {
```

**Exceptions**: `err == nil` and `err != nil` comparisons are fine. Lines using `errors.Is` or `errors.As` are fine. Comments are fine.
