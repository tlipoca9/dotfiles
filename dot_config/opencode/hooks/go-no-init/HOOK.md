---
name: go-no-init
hook: tool.execute.before
tools: [write, edit, multiedit, apply_patch]
extensions: [.go]
action: warn
pattern: ^func\s+init\s*\(\s*\)
exclude:
  - ^\s*//
  - _test\.go
---

## Message

⚠️ `init()` function detected in {{file}} ({{lines}})

Per the Uber Go Style Guide, avoid `init()` where possible. Consider:
- Using a `var` assignment: `var _default = newDefault()`
- Moving logic to `main()` or an explicit initialization function
- Using dependency injection

Acceptable uses of `init()`:
- `database/sql` driver registration
- Encoding type registries
- `template.Must()` precomputation

If this `init()` is necessary, ensure it is:
1. Completely deterministic
2. Does not depend on ordering of other `init()` functions
3. Does not access global/environment state
4. Does not perform I/O
