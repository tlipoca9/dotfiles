---
name: go-type-assert-safety
hook: tool.execute.before
tools: [write, edit, multiedit, apply_patch]
extensions: [.go]
action: block
pattern: \w+\s*:?=\s*\w+\.\(\w
exclude:
  - ^\s*//
  - ,\s*ok\s*:?=
  - \w+\s*,\s*\w+\s*:?=
---

## Message

🚫 Unsafe type assertion (without comma-ok) detected in {{file}} ({{lines}})

Per the Uber Go Style Guide, single-return type assertions panic on failure.
Always use the "comma ok" idiom:

```go
// BAD: panics if i is not a string
t := i.(string)

// GOOD: handles gracefully
t, ok := i.(string)
if !ok {
    // handle the error
}
```
