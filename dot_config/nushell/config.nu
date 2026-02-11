# config.nu - Nushell Main Configuration
#
# See https://www.nushell.sh/book/configuration.html
# Nushell sets "sensible defaults" for most settings,
# only override what you need here.

$env.config.shell_integration.osc133 = false

# Atuin - shell history & completions
source ($nu.default-config-dir | path join atuin-init.nu)
source ($nu.default-config-dir | path join atuin-completions.nu)

