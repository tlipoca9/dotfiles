---
name: go-error-equality
hook: tool.execute.before
tools: [write, edit, multiedit, apply_patch]
extensions: [.go]
action: block
pattern:
  - \berr\s*==\s*Err\w+
  - \berr\s*!=\s*Err\w+
  - \bErr\w+\s*==\s*err\b
  - \bErr\w+\s*!=\s*err\b
exclude:
  - ^\s*//
  - err\s*[!=]=\s*nil
  - errors\.Is
  - errors\.As
---

## Message

🚫 Direct error comparison (`==` / `!=`) detected in {{file}} ({{lines}})

Per the Uber Go Style Guide, never compare errors with `==` or `!=`.
Use `errors.Is()` or `errors.As()` instead, which correctly handle wrapped errors.

```go
// BAD
if err == ErrNotFound {

// GOOD
if errors.Is(err, ErrNotFound) {
```
