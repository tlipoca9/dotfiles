import { type Plugin, tool } from "@opencode-ai/plugin"
import Database from "bun:sqlite"
import { homedir } from "os"
import { join } from "path"

interface UsageRecord {
  id?: number
  tool_name: string
  project: string
  session_id: string
  timestamp: string
  file_path?: string
  tool_category: string
  success: number
  duration_ms?: number
}

function categorizeTool(toolName: string): string {
  const fileTools = ["read", "write", "edit", "glob", "grep", "ast_grep_search", "ast_grep_replace", "lsp_goto_definition", "lsp_find_references", "lsp_symbols", "lsp_rename", "lsp_prepare_rename", "lsp_diagnostics"]
  const shellTools = ["bash", "nushell", "interactive_bash"]
  const agentTools = ["task", "session_search", "session_list", "session_read", "session_info"]
  const editTools = ["apply_patch", "multiedit"]
  const metaTools = ["question", "skill", "skill_mcp", "slashcommand"]
  const browserTools = ["dev-browser", "playwright", "webfetch", "websearch_web_search_exa", "context7_query-docs", "context7_resolve-library-id", "grep_app_searchGitHub", "look_at"]

  if (fileTools.includes(toolName)) return "file"
  if (shellTools.includes(toolName)) return "shell"
  if (agentTools.includes(toolName)) return "agent"
  if (editTools.includes(toolName)) return "edit"
  if (metaTools.includes(toolName)) return "meta"
  if (browserTools.includes(toolName)) return "browser"
  return "other"
}

function getDbPath(): string {
  return join(homedir(), ".opencode", "usage.db")
}

function initDb(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS usage_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tool_name TEXT NOT NULL,
      project TEXT NOT NULL,
      session_id TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      file_path TEXT,
      tool_category TEXT NOT NULL,
      success INTEGER DEFAULT 1,
      duration_ms INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_tool_name ON usage_stats(tool_name);
    CREATE INDEX IF NOT EXISTS idx_project ON usage_stats(project);
    CREATE INDEX IF NOT EXISTS idx_session_id ON usage_stats(session_id);
    CREATE INDEX IF NOT EXISTS idx_timestamp ON usage_stats(timestamp);
    CREATE INDEX IF NOT EXISTS idx_tool_category ON usage_stats(tool_category);
  `)
}

function recordUsage(db: Database, record: UsageRecord): void {
  const stmt = db.prepare(`
    INSERT INTO usage_stats (tool_name, project, session_id, timestamp, file_path, tool_category, success, duration_ms)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)
  stmt.run(
    record.tool_name,
    record.project,
    record.session_id,
    record.timestamp,
    record.file_path || null,
    record.tool_category,
    record.success,
    record.duration_ms || null,
  )
}

interface QueryStatsOptions {
  tool_name?: string
  tool_category?: string
  project?: string
  session_id?: string
  start_date?: string
  end_date?: string
  limit?: number
}

function queryStats(db: Database, options: QueryStatsOptions): UsageRecord[] {
  const conditions: string[] = []
  const params: (string | number)[] = []

  if (options.tool_name) {
    conditions.push("tool_name = ?")
    params.push(options.tool_name)
  }
  if (options.tool_category) {
    conditions.push("tool_category = ?")
    params.push(options.tool_category)
  }
  if (options.project) {
    conditions.push("project = ?")
    params.push(options.project)
  }
  if (options.session_id) {
    conditions.push("session_id = ?")
    params.push(options.session_id)
  }
  if (options.start_date) {
    conditions.push("timestamp >= ?")
    params.push(options.start_date)
  }
  if (options.end_date) {
    conditions.push("timestamp <= ?")
    params.push(options.end_date)
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""
  const limit = options.limit || 100

  const stmt = db.prepare(`
    SELECT id, tool_name, project, session_id, timestamp, file_path, tool_category, success, duration_ms
    FROM usage_stats
    ${whereClause}
    ORDER BY timestamp DESC
    LIMIT ?
  `)

  return stmt.all(...params, limit) as UsageRecord[]
}

function getSummary(db: Database, options: QueryStatsOptions): Record<string, number | string> {
  const conditions: string[] = []
  const params: (string | number)[] = []

  if (options.tool_name) {
    conditions.push("tool_name = ?")
    params.push(options.tool_name)
  }
  if (options.tool_category) {
    conditions.push("tool_category = ?")
    params.push(options.tool_category)
  }
  if (options.project) {
    conditions.push("project = ?")
    params.push(options.project)
  }
  if (options.session_id) {
    conditions.push("session_id = ?")
    params.push(options.session_id)
  }
  if (options.start_date) {
    conditions.push("timestamp >= ?")
    params.push(options.start_date)
  }
  if (options.end_date) {
    conditions.push("timestamp <= ?")
    params.push(options.end_date)
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""

  const totalStmt = db.prepare(`SELECT COUNT(*) as count FROM usage_stats ${whereClause}`)
  const total = (totalStmt.get(...params) as { count: number }).count

  const byToolStmt = db.prepare(`
    SELECT tool_name, COUNT(*) as count
    FROM usage_stats
    ${whereClause}
    GROUP BY tool_name
    ORDER BY count DESC
    LIMIT 10
  `)
  const byTool = byToolStmt.all(...params) as { tool_name: string; count: number }[]

  const byCategoryStmt = db.prepare(`
    SELECT tool_category, COUNT(*) as count
    FROM usage_stats
    ${whereClause}
    GROUP BY tool_category
    ORDER BY count DESC
  `)
  const byCategory = byCategoryStmt.all(...params) as { tool_category: string; count: number }[]

  const byProjectStmt = db.prepare(`
    SELECT project, COUNT(*) as count
    FROM usage_stats
    ${whereClause}
    GROUP BY project
    ORDER BY count DESC
    LIMIT 10
  `)
  const byProject = byProjectStmt.all(...params) as { project: string; count: number }[]

  return {
    total,
    by_tool: JSON.stringify(byTool),
    by_category: JSON.stringify(byCategory),
    by_project: JSON.stringify(byProject),
  }
}

const UsageStatsTool = tool({
  description: "Query OpenCode usage statistics",
  args: {
    action: tool.schema.enum(["query", "summary", "clear"]),
    tool_name: tool.schema.string().optional(),
    tool_category: tool.schema.string().optional(),
    project: tool.schema.string().optional(),
    session_id: tool.schema.string().optional(),
    start_date: tool.schema.string().optional(),
    end_date: tool.schema.string().optional(),
    limit: tool.schema.number().optional(),
  },
  async execute(args, context) {
    const dbPath = getDbPath()
    let db: Database

    try {
      db = new Database(dbPath, { create: true })
      initDb(db)
    } catch (error) {
      return { error: `Failed to open database: ${error}` }
    }

    try {
      const action = args.action || "summary"

      if (action === "clear") {
        db.exec("DELETE FROM usage_stats")
        return { message: "Usage statistics cleared" }
      }

      if (action === "query") {
        const records = queryStats(db, {
          tool_name: args.tool_name,
          tool_category: args.tool_category,
          project: args.project,
          session_id: args.session_id,
          start_date: args.start_date,
          end_date: args.end_date,
          limit: args.limit,
        })
        return { records }
      }

      if (action === "summary") {
        const summary = getSummary(db, {
          tool_name: args.tool_name,
          tool_category: args.tool_category,
          project: args.project,
          session_id: args.session_id,
          start_date: args.start_date,
          end_date: args.end_date,
        })
        return {
          total: summary.total,
          by_tool: JSON.parse(summary.by_tool as string),
          by_category: JSON.parse(summary.by_category as string),
          by_project: JSON.parse(summary.by_project as string),
        }
      }

      return { error: "Unknown action" }
    } finally {
      db.close()
    }
  },
})
export const UsageStatsPlugin: Plugin = async ({ directory, sessionID }) => {
  const dbPath = getDbPath()
  let db: Database

  try {
    db = new Database(dbPath, { create: true })
    initDb(db)
  } catch (error) {
    console.error("[usage-stats] Failed to initialize database:", error)
    return {}
  }

  const startTimes = new Map<string, number>()

  return {
    "tool.execute.before": async (input, output) => {
      startTimes.set(input.callID, Date.now())
    },
    "tool.execute.after": async (input, output) => {
      const startTime = startTimes.get(input.callID)
      const durationMs = startTime ? Date.now() - startTime : undefined
      startTimes.delete(input.callID)

      const filePath = typeof input.args?.filePath === "string" ? input.args.filePath : undefined

      const record: UsageRecord = {
        tool_name: input.tool,
        project: directory,
        session_id: input.sessionID,
        timestamp: new Date().toISOString(),
        file_path: filePath,
        tool_category: categorizeTool(input.tool),
        success: output?.output ? 1 : 0,
        duration_ms: durationMs,
      }

      try {
        recordUsage(db, record)
      } catch (error) {
        console.error("[usage-stats] Failed to record usage:", error)
      }
    },
    tool: {
      "usage-stats": UsageStatsTool,
    },
  }
}
