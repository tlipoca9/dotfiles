---
name: go-no-embedded-mutex
hook: tool.execute.before
tools: [write, edit, multiedit, apply_patch]
extensions: [.go]
action: block
pattern: ^\s+sync\.(Mutex|RWMutex)\s*$
exclude:
  - ^\s*//
---

## Message

🚫 Embedded `sync.Mutex` / `sync.RWMutex` detected in {{file}} ({{lines}})

Per the Uber Go Style Guide, mutexes must NOT be embedded in structs.
Embedding exposes `Lock()` and `Unlock()` as part of the struct's API.

Use a named field instead:

```go
// BAD
type SMap struct {
    sync.Mutex
    data map[string]string
}

// GOOD
type SMap struct {
    mu   sync.Mutex
    data map[string]string
}
```
