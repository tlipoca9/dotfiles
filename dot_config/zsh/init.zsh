#!/usr/bin/env zsh

has_command() {
  command -v "$@" >/dev/null 2>&1 && return 0 || return 1
}

retry() {
  local n=1
  local max=5
  local delay=15
  while true; do
    "$@" && break || {
      if [[ $n -lt $max ]]; then
        ((n++))
        echo "Command failed. Attempt $n/$max:"
        sleep $delay;
      else
        echo "The command has failed after $n attempts."
        return 1
      fi
    }
  done
}

export ZSH_CONFIG_HOME="$(dirname $0)"
export PATH="$HOME/.local/bin:$PATH"


[[ -f $ZSH_CONFIG_HOME/xdg.zsh ]] && source $ZSH_CONFIG_HOME/xdg.zsh
[[ -f $ZSH_CONFIG_HOME/brew.zsh ]] && source $ZSH_CONFIG_HOME/brew.zsh
[[ -f $ZSH_CONFIG_HOME/zi.zsh ]] && source $ZSH_CONFIG_HOME/zi.zsh
[[ -f $ZSH_CONFIG_HOME/zi_conf.zsh ]] && source $ZSH_CONFIG_HOME/zi_conf.zsh
