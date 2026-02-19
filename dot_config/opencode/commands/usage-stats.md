---
description: Query OpenCode usage statistics (tools, projects, sessions)
---

Query usage statistics from the usage-stats plugin. 

Actions:
- `summary` (default): Show total count, top tools, categories, and projects
- `query`: Show detailed records with filters
- `clear`: Delete all statistics

Examples:
- `/usage-stats` - Show summary of all usage
- `/usage-stats query tool_name=bash` - Show all bash tool usages
- `/usage-stats summary project=/Users/liujinfeng/code` - Summary for specific project
- `/usage-stats clear` - Clear all statistics

The statistics are stored in ~/.opencode/usage.db
