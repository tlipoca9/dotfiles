---
name: go-type-assert-safety
enabled: true
event: file
action: block
conditions:
  - field: file_path
    operator: regex_match
    pattern: \.go$
  - field: new_text
    operator: regex_match
    pattern: \w+\s*:?=\s*\w+\.\(\w
---

**Unsafe type assertion (without comma-ok) detected**

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

**Exception**: If the assignment has two return values (`, ok :=`), it is safe and this warning does not apply.
