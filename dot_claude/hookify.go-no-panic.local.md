---
name: go-no-panic
enabled: true
event: file
action: warn
conditions:
  - field: file_path
    operator: regex_match
    pattern: \.go$
  - field: new_text
    operator: regex_match
    pattern: \bpanic\s*\(
---

**`panic()` detected**

Per the Uber Go Style Guide, `panic` should NOT be used in production library code.
Functions must return errors instead of panicking.

Acceptable uses:
- In `main()` or `init()` for truly irrecoverable situations
- With `template.Must()` or similar Must-pattern wrappers
- In tests, prefer `t.Fatal()` instead

Replace `panic(...)` with returning an `error`.

**Exceptions**: Comments containing `panic`, `main()` or `init()` functions, and `Must()` wrapper patterns are acceptable.
