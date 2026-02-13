local platform = require('utils.platform')

local options = {
   default_prog = {},
   launch_menu = {},
}

if platform.is_win then
   options.default_prog = { 'nu', '-l' }
   options.launch_menu = {
      { label = 'Nushell', args = { 'nu', '-l' } },
      { label = 'PowerShell Core', args = { 'pwsh', '-NoLogo' } },
      { label = 'PowerShell Desktop', args = { 'powershell' } },
      { label = 'Command Prompt', args = { 'cmd' } },
      {
         label = 'Git Bash',
         args = { 'D:\\scoop\\apps\\git\\current\\bin\\bash.exe', '--login', '-i' },
      },
   }
elseif platform.is_mac then
   local nu = '/opt/homebrew/bin/nu'
   local nu_env = os.getenv('HOME') .. '/.config/nushell/env.nu'
   local nu_config = os.getenv('HOME') .. '/.config/nushell/config.nu'
   options.default_prog = { nu, '-l', '--env-config', nu_env, '--config', nu_config }
   options.launch_menu = {
      { label = 'Nushell', args = { nu, '-l', '--env-config', nu_env, '--config', nu_config } },
      { label = 'Bash', args = { 'bash', '-l' } },
      { label = 'Zsh', args = { 'zsh', '-l' } },
   }
elseif platform.is_linux then
   options.default_prog = { 'nu', '-l' }
   options.launch_menu = {
      { label = 'Nushell', args = { 'nu', '-l' } },
      { label = 'Bash', args = { 'bash', '-l' } },
      { label = 'Zsh', args = { 'zsh', '-l' } },
   }
end

return options
