---
name: enumgen-docs
description: Reference enumgen documentation by cloning the repo locally. enumgen is a Go enum code generator that generates helper methods for enum types with annotations.
license: MIT
compatibility: opencode
metadata:
  audience: developers
  workflow: analysis
---

## What I do

When enumgen is referenced (tool name, GitHub URL, or any question about Go enum code generation), I clone the devgen repository locally for thorough analysis to understand:

- enumgen annotation syntax and options
- Generated methods and their signatures
- Supported underlying types (int, string)
- Performance characteristics and benchmarks

## When to use me

- Any question about enumgen or Go enum code generation
- Understanding `enumgen:@enum` annotation syntax
- Questions about generated methods (String, MarshalJSON, etc.)
- Looking for enum implementation patterns and best practices

## Instructions

1. **Clone to a temp directory** using shallow clone:
   ```bash
   git clone --depth 1 https://github.com/tlipoca9/devgen /tmp/devgen
   ```

2. **Analyze locally** using file tools:
   - Read key files in `/tmp/devgen/cmd/enumgen/`:
     - `README.md` - Complete documentation (Chinese)
     - `README_EN.md` - Complete documentation (English)
     - `generator/generator.go` - Main generator logic
     - `generator/generator_enum.go` - Enum generation logic
     - `rules/enumgen.md` - AI Rules for CodeBuddy/Cursor/Kiro
   - Use Grep/AST-grep to find specific patterns

3. **Reuse existing clones** — if `/tmp/devgen` already exists, don't re-clone

4. **Clean up** when analysis is complete:
   ```bash
   rm -rf /tmp/devgen
   ```

## Key Concepts

### Annotation Format

```go
// enumgen:@enum(options)
type MyEnum int
```

### Options

| Option | Generated Methods | Description |
|--------|------------------|-------------|
| `string` | `String()` | Returns string representation |
| `json` | `MarshalJSON()`, `UnmarshalJSON()` | JSON serialization |
| `text` | `MarshalText()`, `UnmarshalText()` | Text encoding |
| `sql` | `Value()`, `Scan()` | Database driver support |

### @name Annotation

Customize enum value names:

```go
const (
    // enumgen:@name(DEBUG)
    LevelDebug Level = iota + 1
)
```

### Supported Underlying Types

- Integer types: `int`, `int8`, `int16`, `int32`, `int64`, `uint`, `uint8`, `uint16`, `uint32`, `uint64`
- String type: `string`

### Generated Helper Methods

| Method | Description |
|--------|-------------|
| `IsValid() bool` | Check if value is valid (always generated) |
| `List() []Type` | Return all valid enum values |
| `Contains(v Type) bool` | Check if value is valid |
| `ContainsName(name string) bool` | Check if name is valid |
| `Parse(s string) (Type, error)` | Parse string to enum value |
| `Name(v Type) string` | Get string name of enum value |
| `Names() []string` | Return all valid names |

## Example Usage

### Definition

```go
// OrderStatus 订单状态
// enumgen:@enum(string, json, sql)
type OrderStatus int

const (
    OrderStatusPending    OrderStatus = iota + 1
    OrderStatusProcessing
    OrderStatusCompleted
    // enumgen:@name(Cancelled)
    OrderStatusCanceled
)
```

### Generated Code

```go
// String()
func (x OrderStatus) String() string {
    return OrderStatusEnums.Name(x)
}

// MarshalJSON()
func (x OrderStatus) MarshalJSON() ([]byte, error) {
    return json.Marshal(OrderStatusEnums.Name(x))
}

// UnmarshalJSON()
func (x *OrderStatus) UnmarshalJSON(data []byte) error {
    var s string
    if err := json.Unmarshal(data, &s); err != nil {
        return err
    }
    v, err := OrderStatusEnums.Parse(s)
    if err != nil {
        return err
    }
    *x = v
    return nil
}

// Value() (driver.Valuer)
func (x OrderStatus) Value() (driver.Value, error) {
    return OrderStatusEnums.Name(x), nil
}

// Scan() (sql.Scanner)
func (x *OrderStatus) Scan(src any) error {
    // ... implementation
}

// Helper variable
var OrderStatusEnums = _OrderStatusEnums{
    values: []OrderStatus{...},
    names: map[OrderStatus]string{...},
    byName: map[string]OrderStatus{...},
}
```

## Key files to reference

- `/tmp/devgen/cmd/enumgen/README.md` - Full documentation (Chinese)
- `/tmp/devgen/cmd/enumgen/README_EN.md` - Full documentation (English)
- `/tmp/devgen/cmd/enumgen/generator/generator.go` - Main generator
- `/tmp/devgen/cmd/enumgen/generator/generator_enum.go` - Enum generation
- `/tmp/devgen/cmd/enumgen/rules/enumgen.md` - AI Rules documentation
