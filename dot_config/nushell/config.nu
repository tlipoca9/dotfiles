# config.nu - Nushell Main Configuration
#
# See https://www.nushell.sh/book/configuration.html
# Nushell sets "sensible defaults" for most settings,
# only override what you need here.

$env.config.show_banner = false
$env.config.shell_integration.osc133 = false

# Table: rounded borders, index column
$env.config.table.mode = "rounded"
$env.config.table.index_mode = "auto"          # show row index when table is large
$env.config.table.header_on_separator = true    # header on separator line

# Completions: fuzzy matching, case insensitive
$env.config.completions.algorithm = "fuzzy"
$env.config.completions.case_sensitive = false
$env.config.completions.quick = true            # auto-accept if only one match

# Vi mode
$env.config.edit_mode = "vi"
$env.config.cursor_shape.vi_insert = "line"
$env.config.cursor_shape.vi_normal = "block"

# Error display
$env.config.display_errors.exit_code = false    # don't show redundant exit code errors
$env.config.use_ansi_coloring = true

# Atuin - shell history & completions
source ($nu.default-config-dir | path join atuin-init.nu)
source ($nu.default-config-dir | path join atuin-completions.nu)
