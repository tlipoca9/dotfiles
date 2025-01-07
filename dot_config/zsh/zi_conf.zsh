#!/usr/bin/env zsh

# ------- 语法备注 -------
## depth: 设置 git clone 的 --depth
## atload: 在加载后执行的命令
## atclone: 在 clone 后执行的命令
## wait: 延迟加载
## lucid: 关闭延迟加载的加载完成提示

# https://github.com/z-shell/z-a-bin-gem-node
zi ice depth'1' atload'export PATH="$ZPFX/bin:$PATH"'
zi light z-shell/z-a-bin-gem-node
# https://github.com/z-shell/z-a-rust
# zi ice depth'1'
# zi light z-shell/z-a-rust
# https://wiki.zshell.dev/zh-Hans/ecosystem/annexes/meta-plugins#@zsh-users+fast
zi ice depth'1' for \
  light-mode z-shell/z-a-meta-plugins \
  light-mode @zsh-users+fast
# https://github.com/z-shell/z-a-eval
zi ice depth'1'
zi light z-shell/z-a-eval
#
zi ice wait lucid depth'1' has'fzf'
zi light Aloxaf/fzf-tab

# https://github.com/atuinsh/atuin
# zi wait lucid depth'1' as'null' for \
#   id-as'ellie/atuin' \
#   cargo'atuin' sbin'**/atuin' \
#   eval"atuin init zsh" \
#   @z-shell/0
zi wait lucid depth'1' as'null' for \
  from"gh-r" sbin'**/atuin -> atuin' \
  eval"atuin init zsh" \
  @atuinsh/atuin
# https://github.com/denisidoro/navi
# zi wait lucid depth'1' as'null' for \
#   id-as'denisidoro/navi' \
#   cargo'navi' sbin'**/navi' \
#   eval"navi widget zsh" \
#   @z-shell/0
zi wait lucid depth'1' as'null' for \
  has'fzf' \
  from"gh-r" sbin'navi' \
  eval"navi widget zsh" \
  @denisidoro/navi
# https://github.com/starship/starship
zi depth'1' as'null' for \
  id-as'starship/starship' \
  has'starship' \
  eval"starship init zsh" \
  @z-shell/0
# https://github.com/sharkdp/bat
zi wait lucid depth'1' as'null' for \
  id-as'sharkdp/bat' \
  has'bat' \
  atload'
    alias cat="bat --paging=never --plain"
    help() { 
      "$@" --help 2>&1 | bat --paging=never --plain -l help
    }
  ' \
  @z-shell/0
# https://github.com/neovim/neovim
zi wait lucid depth'1' as'null' has'nvim' for \
  id-as'neovim/neovim' \
  atload'
    alias vi="nvim"
    alias vim="nvim"
    export EDITOR="nvim"
  ' \
  @z-shell/0
# https://github.com/eza-community/eza
zi wait lucid depth'1' as'null' for \
  id-as'eza-community/eza' \
  has'eza' \
  atload'
    alias ls="eza --icons -l -g -h --time-style long-iso"
  ' \
  @z-shell/0
# https://github.com/sharkdp/fd
zi wait lucid depth'1' as'null' for \
  id-as'sharkdp/fd' \
  has'fd' \
  atload'
    alias find="fd -HI"
  ' \
  @z-shell/0
# https://github.com/BurntSushi/ripgrep
zi wait lucid depth'1' as'null' for \
  id-as'BurntSushi/ripgrep' \
  has'rg' \
  atload'
    alias grep="rg --no-line-number"
  ' \
  @z-shell/0
# https://github.com/pemistahl/grex
zi wait lucid depth'1' as'null' for \
  from"gh-r" sbin"grex" \
  @pemistahl/grex
# https://github.com/extrawurst/gitui
zi wait lucid depth'1' as'null' for \
  id-as'extrawurst/gitui' \
  has'gitui' \
  atload'
    alias g="gitui"
  ' \
  @z-shell/0
# # https://github.com/ogham/dog
# zi wait lucid depth'1' as'null' for \
#   id-as'ogham/dog' \
#   has'dog' \
#   atload'
#     alias nslookup="dog"
#   ' \
#   @z-shell/0