---
name: go-errors-guard
enabled: true
event: file
action: block
conditions:
  - field: file_path
    operator: regex_match
    pattern: \.go$
  - field: new_text
    operator: regex_match
    pattern: \bfmt\.Errorf\s*\(
---

**`fmt.Errorf` detected**

Direct usage of `fmt.Errorf` is not allowed.
Prefer the project's own errors package (check `internal/errors`, `pkg/errors`, or `errors` directories).
If none exists, use `github.com/cockroachdb/errors`.

Common replacements:
- `fmt.Errorf("msg: %w", err)` -> `errors.Wrap(err, "msg")`
- `fmt.Errorf("msg: %v", err)` -> `errors.Newf("msg: %v", err)`
- `fmt.Errorf("msg")` -> `errors.New("msg")`

**Exception**: Lines that are comments (`//`) are acceptable.
