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
  skill_name?: string
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
      duration_ms INTEGER,
      skill_name TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_tool_name ON usage_stats(tool_name);
    CREATE INDEX IF NOT EXISTS idx_project ON usage_stats(project);
    CREATE INDEX IF NOT EXISTS idx_session_id ON usage_stats(session_id);
    CREATE INDEX IF NOT EXISTS idx_timestamp ON usage_stats(timestamp);
    CREATE INDEX IF NOT EXISTS idx_tool_category ON usage_stats(tool_category);
    CREATE INDEX IF NOT EXISTS idx_skill_name ON usage_stats(skill_name);
  `)
}

function recordUsage(db: Database, record: UsageRecord): void {
  const stmt = db.prepare(`
    INSERT INTO usage_stats (tool_name, project, session_id, timestamp, file_path, tool_category, success, duration_ms, skill_name)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    record.skill_name || null,
  )
}

interface QueryStatsOptions {
  tool_name?: string
  tool_category?: string
  project?: string
  session_id?: string
  skill_name?: string
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
  if (options.skill_name) {
    conditions.push("skill_name = ?")
    params.push(options.skill_name)
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
    SELECT id, tool_name, project, session_id, timestamp, file_path, tool_category, success, duration_ms, skill_name
    FROM usage_stats
    ${whereClause}
    ORDER BY timestamp DESC
    LIMIT ?
  `)

  return stmt.all(...params, limit) as UsageRecord[]
}

function buildWhereClause(options: QueryStatsOptions): { clause: string; params: (string | number)[] } {
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
  if (options.skill_name) {
    conditions.push("skill_name = ?")
    params.push(options.skill_name)
  }
  if (options.start_date) {
    conditions.push("timestamp >= ?")
    params.push(options.start_date)
  }
  if (options.end_date) {
    conditions.push("timestamp <= ?")
    params.push(options.end_date)
  }

  const clause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""
  return { clause, params }
}

interface DurationStats {
  tool_name: string
  count: number
  avg_ms: number
  min_ms: number
  max_ms: number
  total_ms: number
}

function getDurationStats(db: Database, options: QueryStatsOptions): DurationStats[] {
  const { clause, params } = buildWhereClause(options)
  const durationFilter = clause ? `${clause} AND duration_ms IS NOT NULL` : "WHERE duration_ms IS NOT NULL"
  const stmt = db.prepare(`
    SELECT 
      tool_name,
      COUNT(*) as count,
      AVG(duration_ms) as avg_ms,
      MIN(duration_ms) as min_ms,
      MAX(duration_ms) as max_ms,
      SUM(duration_ms) as total_ms
    FROM usage_stats
    ${durationFilter}
    GROUP BY tool_name
    ORDER BY avg_ms DESC
    LIMIT 10
  `)
  return stmt.all(...params) as DurationStats[]
}

interface SkillStats {
  skill_name: string
  count: number
}

function getSkillStats(db: Database, options: QueryStatsOptions): SkillStats[] {
  const { clause, params } = buildWhereClause(options)
  const skillFilter = clause ? `${clause} AND skill_name IS NOT NULL` : "WHERE skill_name IS NOT NULL"
  const stmt = db.prepare(`
    SELECT skill_name, COUNT(*) as count
    FROM usage_stats
    ${skillFilter}
    GROUP BY skill_name
    ORDER BY count DESC
  `)
  return stmt.all(...params) as SkillStats[]
}

interface ProjectStats {
  project: string
  count: number
  session_count: number
}

function getProjectStats(db: Database, options: QueryStatsOptions): ProjectStats[] {
  const { clause, params } = buildWhereClause(options)
  const stmt = db.prepare(`
    SELECT 
      project,
      COUNT(*) as count,
      COUNT(DISTINCT session_id) as session_count
    FROM usage_stats
    ${clause}
    GROUP BY project
    ORDER BY count DESC
    LIMIT 10
  `)
  return stmt.all(...params) as ProjectStats[]
}

interface SessionStats {
  total_sessions: number
  avg_calls_per_session: number
  max_calls_in_session: number
  min_calls_in_session: number
}

function getSessionStats(db: Database, options: QueryStatsOptions): SessionStats {
  const { clause, params } = buildWhereClause(options)
  
  const stmt = db.prepare(`
    SELECT 
      COUNT(DISTINCT session_id) as total_sessions,
      COUNT(*) / COUNT(DISTINCT session_id) as avg_calls_per_session,
      MAX(calls_in_session) as max_calls_in_session,
      MIN(calls_in_session) as min_calls_in_session
    FROM (
      SELECT session_id, COUNT(*) as calls_in_session
      FROM usage_stats
      ${clause}
      GROUP BY session_id
    )
  `)
  const result = stmt.get(...params) as SessionStats
  return {
    total_sessions: result.total_sessions || 0,
    avg_calls_per_session: result.avg_calls_per_session || 0,
    max_calls_in_session: result.max_calls_in_session || 0,
    min_calls_in_session: result.min_calls_in_session || 0,
  }
}

interface HourlyStats {
  hour: number
  count: number
}

function getHourlyStats(db: Database, options: QueryStatsOptions): HourlyStats[] {
  const { clause, params } = buildWhereClause(options)
  const stmt = db.prepare(`
    SELECT CAST(strftime('%H', timestamp) AS INTEGER) as hour, COUNT(*) as count
    FROM usage_stats
    ${clause}
    GROUP BY hour
    ORDER BY hour
  `)
  return stmt.all(...params) as HourlyStats[]
}

interface DayOfWeekStats {
  day_of_week: number
  day_name: string
  count: number
}

function getDayOfWeekStats(db: Database, options: QueryStatsOptions): DayOfWeekStats[] {
  const { clause, params } = buildWhereClause(options)
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
  const stmt = db.prepare(`
    SELECT 
      CAST(strftime('%w', timestamp) AS INTEGER) as day_of_week,
      COUNT(*) as count
    FROM usage_stats
    ${clause}
    GROUP BY day_of_week
    ORDER BY day_of_week
  `)
  const results = stmt.all(...params) as { day_of_week: number; count: number }[]
  return results.map(r => ({
    day_of_week: r.day_of_week,
    day_name: dayNames[r.day_of_week],
    count: r.count,
  }))
}

interface SuccessRateStats {
  total: number
  success: number
  failure: number
  success_rate: number
}

function getSuccessRateStats(db: Database, options: QueryStatsOptions): SuccessRateStats {
  const { clause, params } = buildWhereClause(options)
  const stmt = db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as success,
      SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failure
    FROM usage_stats
    ${clause}
  `)
  const result = stmt.get(...params) as { total: number; success: number; failure: number }
  const success_rate = result.total > 0 ? (result.success / result.total) * 100 : 0
  return {
    total: result.total || 0,
    success: result.success || 0,
    failure: result.failure || 0,
    success_rate: Math.round(success_rate * 10) / 10,
  }
}

interface ToolCategoryStats {
  tool_category: string
  total_duration_ms: number
  avg_duration_ms: number
  call_count: number
}

function getToolCategoryStats(db: Database, options: QueryStatsOptions): ToolCategoryStats[] {
  const { clause, params } = buildWhereClause(options)
  const stmt = db.prepare(`
    SELECT 
      tool_category,
      SUM(COALESCE(duration_ms, 0)) as total_duration_ms,
      AVG(COALESCE(duration_ms, 0)) as avg_duration_ms,
      COUNT(*) as call_count
    FROM usage_stats
    ${clause}
    GROUP BY tool_category
    ORDER BY call_count DESC
  `)
  return stmt.all(...params) as ToolCategoryStats[]
}

interface ToolPairStats {
  tool_a: string
  tool_b: string
  pair_count: number
}

function getToolPairStats(db: Database, options: QueryStatsOptions): ToolPairStats[] {
  const { clause, params } = buildWhereClause(options)
  // Find consecutive tool pairs within sessions
  const stmt = db.prepare(`
    WITH ordered_calls AS (
      SELECT 
        session_id,
        tool_name,
        ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY timestamp) as rn
      FROM usage_stats
      ${clause}
    )
    SELECT 
      a.tool_name as tool_a,
      b.tool_name as tool_b,
      COUNT(*) as pair_count
    FROM ordered_calls a
    JOIN ordered_calls b ON a.session_id = b.session_id AND a.rn = b.rn - 1
    GROUP BY a.tool_name, b.tool_name
    ORDER BY pair_count DESC
    LIMIT 10
  `)
  return stmt.all(...params) as ToolPairStats[]
}

interface FilePathStats {
  file_path: string
  call_count: number
}

function getFilePathStats(db: Database, options: QueryStatsOptions): FilePathStats[] {
  const { clause, params } = buildWhereClause(options)
  const stmt = db.prepare(`
    SELECT file_path, COUNT(*) as call_count
    FROM usage_stats
    ${clause} AND file_path IS NOT NULL
    GROUP BY file_path
    ORDER BY call_count DESC
    LIMIT 10
  `)
  return stmt.all(...params) as FilePathStats[]
}

interface ProjectSummary {
  project: string
  call_count: number
  session_count: number
  unique_tools: number
  total_duration_ms: number
}

function getProjectSummary(db: Database, options: QueryStatsOptions): ProjectSummary[] {
  const { clause, params } = buildWhereClause(options)
  const stmt = db.prepare(`
    SELECT 
      project,
      COUNT(*) as call_count,
      COUNT(DISTINCT session_id) as session_count,
      COUNT(DISTINCT tool_name) as unique_tools,
      SUM(COALESCE(duration_ms, 0)) as total_duration_ms
    FROM usage_stats
    ${clause}
    GROUP BY project
    ORDER BY call_count DESC
  `)
  return stmt.all(...params) as ProjectSummary[]
}

function getSummary(db: Database, options: QueryStatsOptions): Record<string, any> {
  const { clause, params } = buildWhereClause(options)

  const totalStmt = db.prepare(`SELECT COUNT(*) as count FROM usage_stats ${clause}`)
  const total = (totalStmt.get(...params) as { count: number }).count

  const byToolStmt = db.prepare(`
    SELECT tool_name, COUNT(*) as count
    FROM usage_stats
    ${clause}
    GROUP BY tool_name
    ORDER BY count DESC
    LIMIT 15
  `)
  const byTool = byToolStmt.all(...params) as { tool_name: string; count: number }[]

  const byCategoryStmt = db.prepare(`
    SELECT tool_category, COUNT(*) as count
    FROM usage_stats
    ${clause}
    GROUP BY tool_category
    ORDER BY count DESC
  `)
  const byCategory = byCategoryStmt.all(...params) as { tool_category: string; count: number }[]

  const byProjectStmt = db.prepare(`
    SELECT project, COUNT(*) as count
    FROM usage_stats
    ${clause}
    GROUP BY project
    ORDER BY count DESC
    LIMIT 10
  `)
  const byProject = byProjectStmt.all(...params) as { project: string; count: number }[]

  const durationStats = getDurationStats(db, options)
  const skillStats = getSkillStats(db, options)
  const sessionStats = getSessionStats(db, options)
  const hourlyStats = getHourlyStats(db, options)
  const dayOfWeekStats = getDayOfWeekStats(db, options)
  const successRateStats = getSuccessRateStats(db, options)
  const toolCategoryStats = getToolCategoryStats(db, options)
  const toolPairStats = getToolPairStats(db, options)
  const filePathStats = getFilePathStats(db, options)
  const projectSummary = getProjectSummary(db, options)

  return {
    total,
    by_tool: byTool,
    by_category: byCategory,
    by_project: byProject,
    by_duration: durationStats,
    by_skill: skillStats,
    session: sessionStats,
    hourly: hourlyStats,
    day_of_week: dayOfWeekStats,
    success_rate: successRateStats,
    tool_category_detail: toolCategoryStats,
    tool_pairs: toolPairStats,
    file_paths: filePathStats,
    project_summary: projectSummary,
  }
}

function formatSummary(summary: Record<string, any>): string {
  const lines: string[] = []
  const indent = "  "

  lines.push("## 📊 Usage Statistics")
  lines.push("")
  lines.push(`**Total Calls**: ${summary.total}`)
  lines.push("")

  if (summary.success_rate) {
    lines.push("### ✅ Success Rate")
    lines.push(`| Metric | Value |`)
    lines.push(`|--------|-------|`)
    lines.push(`| Total | ${summary.success_rate.total} |`)
    lines.push(`| Success | ${summary.success_rate.success} |`)
    lines.push(`| Failure | ${summary.success_rate.failure} |`)
    lines.push(`| **Success Rate** | **${summary.success_rate.success_rate}%** |`)
    lines.push("")
  }

  if (summary.session) {
    lines.push("### 🔹 Session Analysis")
    lines.push(`| Metric | Value |`)
    lines.push(`|--------|-------|`)
    lines.push(`| Total Sessions | ${summary.session.total_sessions} |`)
    lines.push(`| Avg Calls/Session | ${summary.session.avg_calls_per_session.toFixed(1)} |`)
    lines.push(`| Max Calls in Session | ${summary.session.max_calls_in_session} |`)
    lines.push(`| Min Calls in Session | ${summary.session.min_calls_in_session} |`)
    lines.push("")
  }

  if (summary.by_project && summary.by_project.length > 0) {
    lines.push("### 📁 By Project")
    lines.push("| Project | Calls |")
    lines.push("|---------|-------|")
    for (const p of summary.by_project) {
      const proj = p.project.length > 50 ? "..." + p.project.slice(-47) : p.project
      lines.push(`| ${proj} | ${p.count} |`)
    }
    lines.push("")
  }

  if (summary.project_summary && summary.project_summary.length > 0) {
    lines.push("### 📊 Project Summary")
    lines.push("| Project | Calls | Sessions | Unique Tools | Total Duration |")
    lines.push("|---------|-------|----------|--------------|----------------|")
    for (const p of summary.project_summary) {
      const proj = p.project.length > 20 ? "..." + p.project.slice(-17) : p.project
      const duration = p.total_duration_ms > 0 ? `${(p.total_duration_ms / 1000).toFixed(1)}s` : "-"
      lines.push(`| ${proj} | ${p.call_count} | ${p.session_count} | ${p.unique_tools} | ${duration} |`)
    }
    lines.push("")
  }

  if (summary.by_tool && summary.by_tool.length > 0) {
    lines.push("### 🛠️ By Tool (Top 15)")
    lines.push("| Tool | Calls |")
    lines.push("|------|-------|")
    for (const t of summary.by_tool) {
      lines.push(`| ${t.tool_name} | ${t.count} |`)
    }
    lines.push("")
  }

  if (summary.by_category && summary.by_category.length > 0) {
    lines.push("### 📦 By Category")
    lines.push("| Category | Calls |")
    lines.push("|----------|-------|")
    for (const c of summary.by_category) {
      lines.push(`| ${c.tool_category} | ${c.count} |`)
    }
    lines.push("")
  }

  if (summary.tool_category_detail && summary.tool_category_detail.length > 0) {
    lines.push("### 📊 Category Performance")
    lines.push("| Category | Calls | Avg Duration | Total Duration |")
    lines.push("|----------|-------|--------------|----------------|")
    for (const c of summary.tool_category_detail) {
      lines.push(`| ${c.tool_category} | ${c.call_count} | ${c.avg_duration_ms.toFixed(1)}ms | ${c.total_duration_ms}ms |`)
    }
    lines.push("")
  }

  if (summary.by_duration && summary.by_duration.length > 0) {
    lines.push("### ⏱️ Tool Duration (Top 10)")
    lines.push("| Tool | Avg | Min | Max | Total |")
    lines.push("|------|-----|-----|-----|-------|")
    for (const d of summary.by_duration) {
      lines.push(`| ${d.tool_name} | ${d.avg_ms.toFixed(1)}ms | ${d.min_ms}ms | ${d.max_ms}ms | ${d.total_ms}ms |`)
    }
    lines.push("")
  }

  if (summary.by_skill && summary.by_skill.length > 0) {
    lines.push("### 🎯 By Skill")
    lines.push("| Skill | Calls |")
    lines.push("|-------|-------|")
    for (const s of summary.by_skill) {
      lines.push(`| ${s.skill_name} | ${s.count} |`)
    }
    lines.push("")
  }

  if (summary.tool_pairs && summary.tool_pairs.length > 0) {
    lines.push("### 🔗 Tool Transition Pairs")
    lines.push("| From → To | Count |")
    lines.push("|-----------|-------|")
    for (const p of summary.tool_pairs) {
      lines.push(`| ${p.tool_a} → ${p.tool_b} | ${p.pair_count} |`)
    }
    lines.push("")
  }

  if (summary.file_paths && summary.file_paths.length > 0) {
    lines.push("### 📄 Most Accessed Files")
    lines.push("| File Path | Calls |")
    lines.push("|-----------|-------|")
    for (const f of summary.file_paths) {
      const path = f.file_path.length > 50 ? "..." + f.file_path.slice(-47) : f.file_path
      lines.push(`| ${path} | ${f.call_count} |`)
    }
    lines.push("")
  }

  if (summary.hourly && summary.hourly.length > 0) {
    lines.push("### 🕐 Activity by Hour")
    lines.push("| Hour | Calls |")
    lines.push("|------|-------|")
    const hourlyData = summary.hourly as { hour: number; count: number }[] || []
    const hourMap = new Map<number, number>(hourlyData.map(h => [h.hour, h.count]))
    const maxCount = Math.max(...hourlyData.map(x => x.count), 1)
    for (let h = 0; h < 24; h++) {
      const count = hourMap.get(h) ?? 0
      const barLen = Math.ceil((count / maxCount) * 10)
      const bar = "█".repeat(barLen)
      lines.push(`| ${h.toString().padStart(2, "0")}:00 | ${count.toString().padStart(3)} | ${bar}|`)
    }
    lines.push("")
  }

  if (summary.day_of_week && summary.day_of_week.length > 0) {
    lines.push("### 📅 Activity by Day of Week")
    lines.push("| Day | Calls |")
    lines.push("|-----|-------|")
    for (const d of summary.day_of_week) {
      lines.push(`| ${d.day_name} | ${d.count} |`)
    }
    lines.push("")
  }

  return lines.join("\n")
}

const UsageStatsTool = tool({
  description: "Query OpenCode usage statistics",
  args: {
    action: tool.schema.enum(["query", "summary", "clear"]),
    tool_name: tool.schema.string().optional(),
    tool_category: tool.schema.string().optional(),
    project: tool.schema.string().optional(),
    session_id: tool.schema.string().optional(),
    skill_name: tool.schema.string().optional(),
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
      return `Error: Failed to open database: ${error}`
    }

    try {
      const action = args.action || "summary"

      if (action === "clear") {
        db.exec("DROP TABLE IF EXISTS usage_stats")
        initDb(db)
        return "Usage statistics cleared"
      }

      if (action === "query") {
        const records = queryStats(db, {
          tool_name: args.tool_name,
          tool_category: args.tool_category,
          project: args.project,
          session_id: args.session_id,
          skill_name: args.skill_name,
          start_date: args.start_date,
          end_date: args.end_date,
          limit: args.limit,
        })
        return JSON.stringify({ records }, null, 2)
      }

      if (action === "summary") {
        const summary = getSummary(db, {
          tool_name: args.tool_name,
          tool_category: args.tool_category,
          project: args.project,
          session_id: args.session_id,
          skill_name: args.skill_name,
          start_date: args.start_date,
          end_date: args.end_date,
        })
        return formatSummary(summary)
      }

      return "Error: Unknown action"
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
      const skillName = input.tool === "skill" && typeof input.args?.name === "string" ? input.args.name : undefined

      const record: UsageRecord = {
        tool_name: input.tool,
        project: directory,
        session_id: input.sessionID,
        timestamp: new Date().toISOString(),
        file_path: filePath,
        tool_category: categorizeTool(input.tool),
        success: output?.output ? 1 : 0,
        duration_ms: durationMs,
        skill_name: skillName,
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
