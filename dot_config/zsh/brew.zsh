#!/usr/bin/env zsh

__dotfiles_homebrew_on_linux() {
  HOMEBREW_PREFIX="/home/linuxbrew/.linuxbrew"
  if ! ls "${HOMEBREW_PREFIX}/bin/brew" >/dev/null 2>&1; then
    NONINTERACTIVE=1 bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  fi
  eval "$(${HOMEBREW_PREFIX}/bin/brew shellenv)"
}
__dotfiles_homebrew_on_mac() {
  UNAME_MACHINE="$(/usr/bin/uname -m)"
  if [[ "${UNAME_MACHINE}" == "arm64" ]]
  then
      # On ARM macOS, this script installs to /opt/homebrew only
      HOMEBREW_PREFIX="/opt/homebrew"
  else
      # On Intel macOS, this script installs to /usr/local only
      HOMEBREW_PREFIX="/usr/local"
  fi
  if ! ls "${HOMEBREW_PREFIX}/bin/brew" >/dev/null 2>&1; then
    NONINTERACTIVE=1 bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  fi
  eval "$(${HOMEBREW_PREFIX}/bin/brew shellenv)"
}

if command -v brew > /dev/null 2>&1; then
  case "$OSTYPE" in
    linux*)         __dotfiles_homebrew_on_linux ;;
    darwin*)        __dotfiles_homebrew_on_mac ;;
  esac
fi
