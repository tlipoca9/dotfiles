---
name: go-no-generated-edit
enabled: true
event: file
action: block
conditions:
  - field: file_path
    operator: regex_match
    pattern: \.go$
  - field: file_path
    operator: regex_match
    pattern: _gen\.go$|_generated\.go$|\.gen\.go$|\.pb\.go$|_enums\.go$|_validate\.go$
---

**Attempting to edit a likely generated Go file**

This file appears to be generated code based on its filename pattern (e.g., `_gen.go`, `_generated.go`, `.pb.go`, `_enum.go`, `_validate.go`). Generated files should not be edited directly.

**Common patterns:**
- `*_gen.go` / `*_generated.go` - Generic code generators
- `*.pb.go` - protoc-gen-go
- `*_enum.go` - enumgen
- `*_validate.go` - validategen

**How to fix:**
1. Find and edit the source template/generator instead
2. Re-run the generator (e.g., `go generate`, `protoc`, `devgen`) after modifying the source
3. If this is a false positive (file is not actually generated), you may proceed
