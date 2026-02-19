---
name: validategen-docs
description: Reference validategen documentation by cloning the repo locally. validategen is a Go struct validation code generator that generates Validate() methods with 40+ validation rules.
license: MIT
compatibility: opencode
metadata:
  audience: developers
  workflow: analysis
---

## What I do

When validategen is referenced (tool name, GitHub URL, or any question about Go struct validation), I clone the devgen repository locally for thorough analysis to understand:

- validategen annotation syntax and validation rules
- Generated Validate() method signatures
- Supported field types and validation constraints
- Integration with enumgen (@oneof_enum)

## When to use me

- Any question about validategen or Go struct validation code generation
- Understanding `validategen:@validate` annotation syntax
- Questions about validation rules (@required, @email, @regex, etc.)
- Looking for struct validation patterns and best practices

## Instructions

1. **Clone to a temp directory** using shallow clone:
   ```bash
   git clone --depth 1 https://github.com/tlipoca9/devgen /tmp/devgen
   ```

2. **Analyze locally** using file tools:
   - Read key files in `/tmp/devgen/cmd/validategen/`:
     - `README.md` - Complete documentation (Chinese)
     - `README_EN.md` - Complete documentation (English)
     - `generator/generator.go` - Main generator logic
     - `generator/rule.go` - Rule definitions
     - `generator/registry.go` - Rule registry
     - `rules/validategen.md` - AI Rules for CodeBuddy/Cursor/Kiro
   - Use Grep/AST-grep to find specific patterns

3. **Reuse existing clones** — if `/tmp/devgen` already exists, don't re-clone

4. **Clean up** when analysis is complete:
   ```bash
   rm -rf /tmp/devgen
   ```

## Key Concepts

### Annotation Format

```go
// validategen:@validate
type MyStruct struct {
    // validategen:@required
    // validategen:@email
    Field string
}
```

### Validation Rules Overview

| Category | Rules |
|----------|-------|
| **Presence** | `@required`, `@default(value)` |
| **Comparison** | `@min`, `@max`, `@len`, `@gt`, `@gte`, `@lt`, `@lte`, `@eq`, `@ne` |
| **Enum** | `@oneof`, `@oneof_enum(EnumType)` |
| **String Format** | `@email`, `@url`, `@uuid`, `@ip`, `@ipv4`, `@ipv6`, `@alpha`, `@alphanum`, `@numeric` |
| **String Match** | `@contains`, `@excludes`, `@startswith`, `@endswith`, `@regex` |
| **Format** | `@format(json/yaml/toml/csv)`, `@duration` |
| **Kubernetes** | `@dns1123_label`, `@cpu`, `@memory`, `@disk` |
| **Custom** | `@method(Validate)` |

### Key Annotations

#### @validate - Mark struct for validation
```go
// validategen:@validate
type User struct {
    Name string
}
```

#### @required - Field must be non-zero
```go
// validategen:@required
Name string  // non-empty string
Age int      // > 0
IsActive bool // must be true
Tags []string // non-empty slice
Profile *Profile // non-nil pointer
```

#### @oneof_enum - Enum type validation
```go
// enumgen:@enum(string)
type Role int

// validategen:@validate
type User struct {
    // validategen:@oneof_enum(Role)
    Role Role  // auto-uses RoleEnums.Contains()
}
```

#### @method - Call custom validation
```go
type Address struct {
    Street string
}

func (a Address) Validate() error { ... }

// validategen:@validate
type User struct {
    // validategen:@method(Validate)
    Address Address
}
```

#### postValidate hook
```go
// validategen:@validate
type User struct {
    Role string
    Age int
}

func (x User) postValidate(errs []string) error {
    // Custom validation logic
    return nil
}
```

## Generated Methods

| Method | Description |
|--------|-------------|
| `Validate() error` | Main validation method (always generated) |
| `SetDefaults() error` | Set default values (generated if @default is used) |

## Example Usage

### Definition

```go
// validategen:@validate
type User struct {
    // validategen:@required
    // validategen:@gt(0)
    ID int64

    // validategen:@required
    // validategen:@min(2)
    // validategen:@max(50)
    Name string

    // validategen:@required
    // validategen:@email
    Email string

    // validategen:@gte(0)
    // validategen:@lte(150)
    Age int

    // validategen:@oneof(admin, user, guest)
    Role string

    // validategen:@url
    Website string

    // validategen:@method(Validate)
    Address Address
}
```

### Usage

```go
user := &User{
    ID:    1,
    Name:  "John",
    Email: "john@example.com",
    Age:   25,
    Role:  "admin",
}

if err := user.Validate(); err != nil {
    fmt.Println("Validation failed:", err)
}
```

## Key files to reference

- `/tmp/devgen/cmd/validategen/README.md` - Full documentation (Chinese)
- `/tmp/devgen/cmd/validategen/README_EN.md` - Full documentation (English)
- `/tmp/devgen/cmd/validategen/generator/generator.go` - Main generator
- `/tmp/devgen/cmd/validategen/generator/rule.go` - Rule definitions
- `/tmp/devgen/cmd/validategen/generator/registry.go` - Rule registry
- `/tmp/devgen/cmd/validategen/rules/validategen.md` - AI Rules documentation
