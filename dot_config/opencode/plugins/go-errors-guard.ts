import type { Plugin } from "@opencode-ai/plugin"
import { readdir, stat } from "fs/promises"
import { join, relative } from "path"

/**
 * Go Errors Guard — blocks fmt.Errorf in .go files.
 * Suggests the project's own errors package or github.com/cockroachdb/errors.
 */

// Matches `fmt.Errorf(` — comment-awareness handled by callers
const FMT_ERRORF_PATTERN = /\bfmt\.Errorf\s*\(/

function lineContainsFmtErrorf(line: string): boolean {
  if (line.trimStart().startsWith("//")) return false
  return FMT_ERRORF_PATTERN.test(line)
}

function findFmtErrorfLines(content: string): number[] {
  const lines = content.split("\n")
  const results: number[] = []
  let inBlockComment = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (inBlockComment) {
      if (line.includes("*/")) inBlockComment = false
      continue
    }

    if (line.includes("/*")) {
      const beforeComment = line.substring(0, line.indexOf("/*"))
      if (FMT_ERRORF_PATTERN.test(beforeComment)) results.push(i + 1)
      if (!line.includes("*/")) inBlockComment = true
      continue
    }

    if (lineContainsFmtErrorf(line)) results.push(i + 1)
  }

  return results
}

function findFmtErrorfInPatch(patchText: string): boolean {
  for (const line of patchText.split("\n")) {
    // Only inspect added lines ('+' prefix, excluding '+++' file headers)
    if (line.startsWith("+") && !line.startsWith("+++")) {
      if (lineContainsFmtErrorf(line.substring(1))) return true
    }
  }
  return false
}

const projectErrorsCache = new Map<string, { hasOwn: boolean; pkg: string; timestamp: number }>()
const CACHE_TTL_MS = 30_000

async function detectProjectErrorsPackage(directory: string): Promise<{ hasOwn: boolean; pkg: string }> {
  const cached = projectErrorsCache.get(directory)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return { hasOwn: cached.hasOwn, pkg: cached.pkg }
  }

  const candidates = ["internal/errors", "pkg/errors", "lib/errors", "errors"]

  for (const candidate of candidates) {
    const dir = join(directory, candidate)
    try {
      const s = await stat(dir)
      if (s.isDirectory()) {
        const entries = await readdir(dir)
        if (entries.some((e) => e.endsWith(".go"))) {
          const modulePath = await detectModulePath(directory)
          const pkg = modulePath ? `${modulePath}/${candidate}` : candidate
          const result = { hasOwn: true, pkg }
          projectErrorsCache.set(directory, { ...result, timestamp: Date.now() })
          return result
        }
      }
    } catch {
      // directory doesn't exist
    }
  }

  const result = { hasOwn: false, pkg: "github.com/cockroachdb/errors" }
  projectErrorsCache.set(directory, { ...result, timestamp: Date.now() })
  return result
}

async function detectModulePath(directory: string): Promise<string | null> {
  try {
    const goMod = Bun.file(join(directory, "go.mod"))
    if (!(await goMod.exists())) return null
    const content = await goMod.text()
    const match = content.match(/^module\s+(\S+)/m)
    return match ? match[1] : null
  } catch {
    return null
  }
}

function buildErrorMessage(filePath: string, lines: number[], errPkg: { hasOwn: boolean; pkg: string }): string {
  const lineInfo = lines.length > 0 ? ` (line${lines.length > 1 ? "s" : ""}: ${lines.join(", ")})` : ""
  const suggestion = errPkg.hasOwn
    ? `Use the project's errors package: "${errPkg.pkg}"`
    : `Use "github.com/cockroachdb/errors" instead (e.g., errors.Newf, errors.Wrap, errors.Wrapf)`

  return [
    `🚫 fmt.Errorf detected in ${filePath}${lineInfo}`,
    ``,
    `Direct usage of fmt.Errorf is not allowed in this project.`,
    suggestion,
    ``,
    `Common replacements:`,
    `  fmt.Errorf("message: %w", err)  →  errors.Wrap(err, "message")`,
    `  fmt.Errorf("message: %v", err)  →  errors.Newf("message: %v", err)`,
    `  fmt.Errorf("message")           →  errors.New("message")`,
  ].join("\n")
}

export const GoErrorsGuard: Plugin = async ({ directory }) => {
  return {
    "tool.execute.before": async (input, output) => {
      const tool = input.tool

      if (tool === "write") {
        const filePath: string = output.args.filePath ?? ""
        if (!filePath.endsWith(".go")) return

        const violatingLines = findFmtErrorfLines(output.args.content ?? "")
        if (violatingLines.length === 0) return

        const errPkg = await detectProjectErrorsPackage(directory)
        throw new Error(buildErrorMessage(relative(directory, filePath) || filePath, violatingLines, errPkg))
      }

      if (tool === "edit") {
        const filePath: string = output.args.filePath ?? ""
        if (!filePath.endsWith(".go")) return

        const newString: string = output.args.newString ?? ""
        if (!FMT_ERRORF_PATTERN.test(newString)) return

        const violatingLines = findFmtErrorfLines(newString)
        if (violatingLines.length === 0) return

        const errPkg = await detectProjectErrorsPackage(directory)
        throw new Error(buildErrorMessage(relative(directory, filePath) || filePath, violatingLines, errPkg))
      }

      if (tool === "multiedit") {
        const filePath: string = output.args.filePath ?? ""
        if (!filePath.endsWith(".go")) return

        for (const edit of (output.args.edits ?? []) as Array<{ newString?: string }>) {
          const newString = edit.newString ?? ""
          if (!FMT_ERRORF_PATTERN.test(newString)) continue

          const violatingLines = findFmtErrorfLines(newString)
          if (violatingLines.length === 0) continue

          const errPkg = await detectProjectErrorsPackage(directory)
          throw new Error(buildErrorMessage(relative(directory, filePath) || filePath, violatingLines, errPkg))
        }
      }

      if (tool === "apply_patch") {
        const patchText: string = output.args.patchText ?? ""
        if (findFmtErrorfInPatch(patchText)) {
          const fileMatch = patchText.match(/^\+\+\+\s+(?:b\/)?(\S+\.go)/m)
          const targetFile = fileMatch ? fileMatch[1] : "unknown .go file"
          const errPkg = await detectProjectErrorsPackage(directory)
          throw new Error(buildErrorMessage(targetFile, [], errPkg))
        }
      }
    },
  }
}
