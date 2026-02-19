import type { Plugin } from "@opencode-ai/plugin"
import { readdir, readFile, stat } from "fs/promises"
import { join, relative, resolve } from "path"
import { homedir } from "os"

interface HookConfig {
  name: string
  hook: "tool.execute.before" | "tool.execute.after"
  tools?: string[]
  extensions?: string[]
  action: "block" | "warn"
  pattern: string | string[]
  exclude?: string | string[]
}

interface ParsedHook {
  config: HookConfig
  message: string
  sourceFile: string
}

function parseFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)
  if (!match) return null

  const raw = match[1]
  const body = match[2]
  const frontmatter: Record<string, unknown> = {}

  for (const line of raw.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue

    // Handle multi-line YAML list continuation (e.g., "pattern:\n  - item1\n  - item2")
    if (trimmed.startsWith("- ")) {
      const lastKey = Object.keys(frontmatter).pop()
      if (lastKey) {
        const lastValue = frontmatter[lastKey]
        if (Array.isArray(lastValue)) {
          lastValue.push(trimmed.substring(2).trim())
        } else if (lastValue === "" || lastValue === null) {
          frontmatter[lastKey] = [trimmed.substring(2).trim()]
        }
        continue
      }
    }

    const colonIdx = trimmed.indexOf(":")
    if (colonIdx === -1) continue

    const key = trimmed.substring(0, colonIdx).trim()
    let value: unknown = trimmed.substring(colonIdx + 1).trim()

    if (typeof value === "string" && value.startsWith("[") && value.endsWith("]")) {
      value = value
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    }

    frontmatter[key] = value
  }

  return { frontmatter, body }
}

function extractMessageSection(body: string): string {
  const messageMatch = body.match(/## Message\s*\r?\n([\s\S]*)/)
  if (!messageMatch) return ""
  return messageMatch[1].trim()
}

function validateConfig(fm: Record<string, unknown>, sourceFile: string): HookConfig | null {
  const name = fm.name as string
  const hook = fm.hook as string
  const action = fm.action as string
  const pattern = fm.pattern

  if (!name || !hook || !action || !pattern) {
    console.error(`[hookify] ${sourceFile}: missing required fields (name, hook, action, pattern)`)
    return null
  }

  if (hook !== "tool.execute.before" && hook !== "tool.execute.after") {
    console.error(`[hookify] ${sourceFile}: unsupported hook "${hook}"`)
    return null
  }

  if (action !== "block" && action !== "warn") {
    console.error(`[hookify] ${sourceFile}: action must be "block" or "warn"`)
    return null
  }

  return {
    name,
    hook: hook as HookConfig["hook"],
    tools: fm.tools as string[] | undefined,
    extensions: fm.extensions as string[] | undefined,
    action: action as HookConfig["action"],
    pattern: pattern as string | string[],
    exclude: fm.exclude as string | string[] | undefined,
  }
}

async function loadHooksFromDir(dir: string): Promise<ParsedHook[]> {
  const hooks: ParsedHook[] = []

  let entries: string[]
  try {
    entries = await readdir(dir)
  } catch {
    return hooks
  }

  for (const entry of entries) {
    const hookDir = join(dir, entry)
    const hookFile = join(hookDir, "HOOK.md")

    try {
      const s = await stat(hookDir)
      if (!s.isDirectory()) continue
    } catch {
      continue
    }

    try {
      const content = await readFile(hookFile, "utf-8")
      const parsed = parseFrontmatter(content)
      if (!parsed) {
        console.error(`[hookify] ${hookFile}: invalid frontmatter`)
        continue
      }

      const config = validateConfig(parsed.frontmatter, hookFile)
      if (!config) continue

      const message = extractMessageSection(parsed.body)
      if (!message) {
        console.error(`[hookify] ${hookFile}: missing ## Message section`)
        continue
      }

      hooks.push({ config, message, sourceFile: hookFile })
    } catch {
      continue
    }
  }

  return hooks
}

function toRegexArray(input: string | string[]): RegExp[] {
  const arr = Array.isArray(input) ? input : [input]
  return arr.map((p) => new RegExp(p))
}

function matchesExtension(filePath: string, extensions?: string[]): boolean {
  if (!extensions || extensions.length === 0) return true
  return extensions.some((ext) => filePath.endsWith(ext))
}

function matchesTool(toolName: string, tools?: string[]): boolean {
  if (!tools || tools.length === 0) return true
  return tools.includes(toolName)
}

// Line-aware scanning: skip single-line comments (//) and block comments (/* */)
function scanLines(content: string, patterns: RegExp[], excludes: RegExp[]): number[] {
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
      const before = line.substring(0, line.indexOf("/*"))
      if (matchesPatterns(before, patterns, excludes)) results.push(i + 1)
      if (!line.includes("*/")) inBlockComment = true
      continue
    }

    const trimmed = line.trimStart()
    if (trimmed.startsWith("//") || trimmed.startsWith("#")) continue

    if (matchesPatterns(line, patterns, excludes)) results.push(i + 1)
  }

  return results
}

function matchesPatterns(text: string, patterns: RegExp[], excludes: RegExp[]): boolean {
  const matched = patterns.some((p) => p.test(text))
  if (!matched) return false
  if (excludes.length > 0 && excludes.some((e) => e.test(text))) return false
  return true
}

function scanPatchAddedLines(patchText: string, patterns: RegExp[], excludes: RegExp[]): boolean {
  for (const line of patchText.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) {
      if (matchesPatterns(line.substring(1), patterns, excludes)) return true
    }
  }
  return false
}

function renderMessage(template: string, vars: Record<string, string>): string {
  let result = template
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, value)
  }
  return result
}

function extractFileContent(tool: string, args: Record<string, unknown>): { filePath: string; contents: string[] } | null {
  if (tool === "write") {
    return {
      filePath: (args.filePath as string) ?? "",
      contents: [(args.content as string) ?? ""],
    }
  }

  if (tool === "edit") {
    return {
      filePath: (args.filePath as string) ?? "",
      contents: [(args.newString as string) ?? ""],
    }
  }

  if (tool === "multiedit") {
    const edits = (args.edits ?? []) as Array<{ newString?: string }>
    return {
      filePath: (args.filePath as string) ?? "",
      contents: edits.map((e) => e.newString ?? ""),
    }
  }

  return null
}

export const OpencodeHookify: Plugin = async ({ directory }) => {
  const globalHooksDir = join(homedir(), ".config", "opencode", "hooks")
  const projectHooksDir = join(directory, ".opencode", "hooks")

  const [globalHooks, projectHooks] = await Promise.all([
    loadHooksFromDir(globalHooksDir),
    loadHooksFromDir(projectHooksDir),
  ])

  const allHooks = [...globalHooks, ...projectHooks]

  if (allHooks.length === 0) return {}

  const beforeHooks = allHooks.filter((h) => h.config.hook === "tool.execute.before")
  const afterHooks = allHooks.filter((h) => h.config.hook === "tool.execute.after")

  const result: Record<string, unknown> = {}

  if (beforeHooks.length > 0) {
    result["tool.execute.before"] = async (
      input: { tool: string; sessionID: string; callID: string },
      output: { args: Record<string, unknown> },
    ) => {
      for (const hook of beforeHooks) {
        await executeHook(hook, input.tool, output.args, directory)
      }
    }
  }

  if (afterHooks.length > 0) {
    result["tool.execute.after"] = async (
      input: { tool: string; sessionID: string; callID: string; args: Record<string, unknown> },
      output: { title: string; output: string; metadata: unknown },
    ) => {
      for (const hook of afterHooks) {
        await executeHook(hook, input.tool, input.args, directory)
      }
    }
  }

  return result
}

async function executeHook(
  hook: ParsedHook,
  tool: string,
  args: Record<string, unknown>,
  directory: string,
): Promise<void> {
  if (!matchesTool(tool, hook.config.tools)) return

  const patterns = toRegexArray(hook.config.pattern)
  const excludes = hook.config.exclude ? toRegexArray(hook.config.exclude) : []

  if (tool === "apply_patch") {
    const patchText = (args.patchText as string) ?? ""
    if (!scanPatchAddedLines(patchText, patterns, excludes)) return

    const fileMatch = patchText.match(/^\+\+\+\s+(?:b\/)?(\S+)/m)
    const targetFile = fileMatch ? fileMatch[1] : "unknown file"

    const message = renderMessage(hook.message, {
      file: targetFile,
      lines: "",
    })

    if (hook.config.action === "block") throw new Error(message)
    return
  }

  const extracted = extractFileContent(tool, args)
  if (!extracted) return

  if (!matchesExtension(extracted.filePath, hook.config.extensions)) return

  for (const content of extracted.contents) {
    const violatingLines = scanLines(content, patterns, excludes)
    if (violatingLines.length === 0) continue

    const relPath = relative(directory, extracted.filePath) || extracted.filePath
    const message = renderMessage(hook.message, {
      file: relPath,
      lines: violatingLines.join(", "),
    })

    if (hook.config.action === "block") throw new Error(message)
  }
}
