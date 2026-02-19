import { tool } from "@opencode-ai/plugin"
import { spawn } from "child_process"
import path from "path"
import fs from "fs"

const DESCRIPTION = await Bun.file(path.join(import.meta.dir, "nushell.txt")).text()

const MAX_METADATA_LENGTH = 30_000
const DEFAULT_TIMEOUT = 2 * 60 * 1000

function killTree(proc: ReturnType<typeof spawn>, opts: { exited: () => boolean }) {
  if (opts.exited()) return
  const pid = proc.pid
  if (!pid) return
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(pid), "/T", "/F"])
    return
  }
  try {
    process.kill(-pid, "SIGTERM")
  } catch {
    try {
      proc.kill("SIGTERM")
    } catch {}
  }
}

function tryParseStructured(raw: string): { structured: boolean; data?: unknown } {
  const trimmed = raw.trim()
  if (!trimmed) return { structured: false }
  if ((trimmed.startsWith("[") && trimmed.endsWith("]")) || (trimmed.startsWith("{") && trimmed.endsWith("}"))) {
    try {
      return { structured: true, data: JSON.parse(trimmed) }
    } catch {
      return { structured: false }
    }
  }
  return { structured: false }
}

export default tool({
  description: DESCRIPTION,
  args: {
    command: tool.schema
      .string()
      .optional()
      .describe("The nushell command to execute (mutually exclusive with script)"),
    script: tool.schema
      .string()
      .optional()
      .describe("Path to a .nu script file to execute (relative to workdir or absolute). Mutually exclusive with command."),
    script_args: tool.schema
      .array(tool.schema.string())
      .optional()
      .describe("Arguments to pass to the script file. Only used when script is provided."),
    timeout: tool.schema
      .number()
      .optional()
      .describe("Optional timeout in milliseconds"),
    workdir: tool.schema
      .string()
      .optional()
      .describe(
        "The working directory to run the command in. Defaults to the project root. Use this instead of 'cd' commands.",
      ),
    description: tool.schema
      .string()
      .describe(
        "Clear, concise description of what this command does in 5-10 words. Examples:\nInput: ls\nOutput: Lists files in current directory\n\nInput: git status\nOutput: Shows working tree status\n\nInput: npm install\nOutput: Installs package dependencies\n\nInput: mkdir foo\nOutput: Creates directory 'foo'",
      ),
  },
  async execute(args, context) {
    if (!args.command && !args.script) {
      throw new Error("Either 'command' or 'script' must be provided.")
    }
    if (args.command && args.script) {
      throw new Error("Provide either 'command' or 'script', not both.")
    }

    const cwd = args.workdir ?? context.directory
    if (args.timeout !== undefined && args.timeout < 0) {
      throw new Error(`Invalid timeout value: ${args.timeout}. Timeout must be a positive number.`)
    }
    const timeout = args.timeout ?? DEFAULT_TIMEOUT

    let spawnArgs: string[]
    if (args.script) {
      const resolved = path.isAbsolute(args.script) ? args.script : path.resolve(cwd, args.script)
      if (!fs.existsSync(resolved)) {
        throw new Error(`Script file not found: ${resolved}`)
      }
      spawnArgs = [resolved, ...(args.script_args ?? [])]
    } else {
      spawnArgs = ["-c", args.command!]
    }

    const proc = spawn("nu", spawnArgs, {
      cwd,
      env: {
        ...process.env,
        NO_COLOR: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
    })

    let stdout = ""
    let stderr = ""

    context.metadata({
      metadata: {
        output: "",
        description: args.description,
      },
    })

    const updateMetadata = () => {
      const combined = stdout + (stderr ? "\nSTDERR:\n" + stderr : "")
      context.metadata({
        metadata: {
          output:
            combined.length > MAX_METADATA_LENGTH
              ? combined.slice(0, MAX_METADATA_LENGTH) + "\n\n..."
              : combined,
          description: args.description,
        },
      })
    }

    proc.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString()
      updateMetadata()
    })

    proc.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString()
      updateMetadata()
    })

    let timedOut = false
    let aborted = false
    let exited = false

    const kill = () => killTree(proc, { exited: () => exited })

    if (context.abort.aborted) {
      aborted = true
      kill()
    }

    const abortHandler = () => {
      aborted = true
      kill()
    }

    context.abort.addEventListener("abort", abortHandler, { once: true })

    const timeoutTimer = setTimeout(() => {
      timedOut = true
      kill()
    }, timeout + 100)

    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timeoutTimer)
        context.abort.removeEventListener("abort", abortHandler)
      }

      proc.once("exit", () => {
        exited = true
        cleanup()
        resolve()
      })

      proc.once("error", (error) => {
        exited = true
        cleanup()
        reject(error)
      })
    })

    const parsed = tryParseStructured(stdout)
    if (parsed.structured) {
      context.metadata({
        metadata: {
          output: stdout.length > MAX_METADATA_LENGTH ? stdout.slice(0, MAX_METADATA_LENGTH) + "\n\n..." : stdout,
          structured: parsed.data,
          description: args.description,
          exit: proc.exitCode,
        },
      })
    }

    let output = stdout
    if (stderr.trim()) {
      if (output) output += "\n"
      output += `STDERR:\n${stderr}`
    }

    const resultMetadata: string[] = []

    if (timedOut) {
      resultMetadata.push(`nushell tool terminated command after exceeding timeout ${timeout} ms`)
    }

    if (aborted) {
      resultMetadata.push("User aborted the command")
    }

    if (proc.exitCode !== null && proc.exitCode !== 0) {
      resultMetadata.push(`Exit code: ${proc.exitCode}`)
    }

    if (resultMetadata.length > 0) {
      output += "\n\n<nushell_metadata>\n" + resultMetadata.join("\n") + "\n</nushell_metadata>"
    }

    return output || "(no output)"
  },
})
