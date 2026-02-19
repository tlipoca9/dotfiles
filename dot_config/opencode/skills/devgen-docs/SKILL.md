---
name: devgen-docs
description: Reference devgen documentation by cloning the repo locally. devgen is a Go code generation toolset with AI Rules system for CodeBuddy, Cursor, and Kiro.
license: MIT
 compatibility: opencode
metadata:
  audience: developers
  workflow: analysis
---

## What I do

When devgen is referenced (tool name, GitHub URL, or any code generation question), I clone the devgen repository locally for thorough analysis using local file tools to understand:

- genkit framework APIs and interfaces
- Annotation parsing and code generation patterns
- AI Rules system and adapter implementations
- Built-in tool implementations (enumgen, validategen)

## When to use me

- Any question about devgen or genkit framework
- Implementing custom code generators using genkit
- Understanding AI Rules system for CodeBuddy/Cursor/Kiro
- Questions about annotation syntax (`// tool:@annotation`)
- Looking for code generation patterns and best practices

## Instructions

1. **Clone to a temp directory** using shallow clone:
   ```bash
   git clone --depth 1 https://github.com/tlipoca9/devgen /tmp/devgen
   ```

2. **Analyze locally** using file tools:
   - Read key files in `/tmp/devgen/`:
     - `README.md` - Overview and quick start
     - `genkit/genkit.go` - Core Generator API
     - `genkit/types.go` - Type definitions and annotation parsing
     - `genkit/adapter.go` - AgentAdapter interface
     - `genkit/adapter_registry.go` - Adapter management
     - `genkit/plugin.go` - Plugin system
     - `cmd/devgen/rules/devgen-rules.md` - AI Rules documentation
     - `docs/plugin.md` - Plugin development guide
   - Use Grep/AST-grep to find specific patterns

3. **Reuse existing clones** — if `/tmp/devgen` already exists, don't re-clone

4. **Clean up** when analysis is complete:
   ```bash
   rm -rf /tmp/devgen
   ```

## Key Concepts

### genkit Framework

- **Generator** - Main entry point for code generation
- **Package/Type/Enum/Interface** - AST representation
- **GeneratedFile** - Code generation with automatic import management

### Tool Interfaces

| Interface | Purpose |
|-----------|---------|
| `Tool` | Core code generation (required) |
| `ConfigurableTool` | IDE autocompletion metadata |
| `ValidatableTool` | Real-time annotation diagnostics |
| `RuleTool` | AI Rules generation for IDEs |

### Annotation Format

```go
// toolname:@annotation(args)
// toolname:@annotation.subannotation(args)
```

Example:
```go
// enumgen:@enum(string, json)
// validategen:@required
// validategen:@email
```

### AI Rules Adapters

| Agent | Output Directory | File Extension |
|-------|-----------------|----------------|
| Kiro | `.kiro/steering/` | `.md` |
| CodeBuddy | `.codebuddy/rules/` | `.mdc` |
| Cursor | `.cursor/rules/` | `.mdc` |

## Key files to reference

- `/tmp/devgen/genkit/genkit.go` - Core Generator API
- `/tmp/devgen/genkit/types.go` - Annotation parsing (`ParseAnnotations`, `HasAnnotation`)
- `/tmp/devgen/genkit/adapter.go` - AgentAdapter interface
- `/tmp/devgen/genkit/adapter_codebuddy.go` - CodeBuddy adapter implementation
- `/tmp/devgen/genkit/adapter_cursor.go` - Cursor adapter implementation
- `/tmp/devgen/genkit/adapter_kiro.go` - Kiro adapter implementation
- `/tmp/devgen/cmd/devgen/rules/devgen-rules.md` - AI Rules system documentation
- `/tmp/devgen/docs/plugin.md` - Plugin development guide
- `/tmp/devgen/docs/rules-adapter.md` - Rules adapter documentation
