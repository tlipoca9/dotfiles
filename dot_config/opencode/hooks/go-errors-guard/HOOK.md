---
name: go-errors-guard
hook: tool.execute.before
tools: [write, edit, multiedit, apply_patch]
extensions: [.go]
action: block
pattern: \bfmt\.Errorf\s*\(
exclude: ^\s*//.*fmt\.Errorf
---

## Message

🚫 `fmt.Errorf` detected in {{file}} ({{lines}})

Direct usage of `fmt.Errorf` is not allowed.
Prefer the project's own errors package (check `internal/errors`, `pkg/errors`, or `errors` directories).
If none exists, use `github.com/cockroachdb/errors`.

Common replacements:
- `fmt.Errorf("msg: %w", err)` → `errors.Wrap(err, "msg")`
- `fmt.Errorf("msg: %v", err)` → `errors.Newf("msg: %v", err)`
- `fmt.Errorf("msg")` → `errors.New("msg")`
