---
name: go-no-panic
hook: tool.execute.before
tools: [write, edit, multiedit, apply_patch]
extensions: [.go]
action: warn
pattern: \bpanic\s*\(
exclude:
  - ^\s*//.*panic
  - ^\s*func\s+main\s*\(
  - ^\s*func\s+init\s*\(
  - \.Must\(
  - template\.Must
---

## Message

⚠️ `panic()` detected in {{file}} ({{lines}})

Per the Uber Go Style Guide, `panic` should NOT be used in production library code.
Functions must return errors instead of panicking.

Acceptable uses:
- In `main()` or `init()` for truly irrecoverable situations
- With `template.Must()` or similar Must-pattern wrappers
- In tests, prefer `t.Fatal()` instead

Replace `panic(...)` with returning an `error`.
