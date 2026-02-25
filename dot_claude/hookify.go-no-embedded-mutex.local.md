---
name: go-no-embedded-mutex
enabled: true
event: file
action: block
conditions:
  - field: file_path
    operator: regex_match
    pattern: \.go$
  - field: new_text
    operator: regex_match
    pattern: ^\s+sync\.(Mutex|RWMutex)\s*$
---

**Embedded `sync.Mutex` / `sync.RWMutex` detected**

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
