#!/bin/sh

set -eu

die() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo_root=$script_dir

[ "$(uname -s)" = Darwin ] || die "this dotfiles repository currently supports macOS only"
[ -d "$repo_root/.git" ] || die "bootstrap.sh must run from a cloned dotfiles repository"
[ -f "$repo_root/Taskfile.yml" ] || die "Taskfile.yml is missing from $repo_root"
[ -f "$repo_root/.chezmoiroot" ] || die ".chezmoiroot is missing from $repo_root"

if ! xcode-select -p >/dev/null 2>&1; then
  xcode-select --install >/dev/null 2>&1 || true
  die "finish installing the Command Line Tools, then run ./bootstrap.sh again"
fi

if ! command -v brew >/dev/null 2>&1; then
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi

if ! command -v brew >/dev/null 2>&1; then
  eval "$(/usr/libexec/path_helper -s)"
fi
brew_bin=$(command -v brew) || die "Homebrew installation completed but brew cannot be found"

eval "$("$brew_bin" shellenv)"

for formula in chezmoi go-task python; do
  if ! brew list --formula "$formula" >/dev/null 2>&1; then
    HOMEBREW_NO_AUTO_UPDATE=1 HOMEBREW_NO_INSTALL_CLEANUP=1 brew install "$formula"
  fi
done

identity="$repo_root/.local/age/identity.txt"
[ -f "$identity" ] || die "restore the age identity to $identity, set mode 0600, then rerun bootstrap"
[ "$(stat -f '%Lp' "$repo_root/.local")" = 700 ] || die "$repo_root/.local must have mode 0700"
[ "$(stat -f '%Lp' "$repo_root/.local/age")" = 700 ] || die "$repo_root/.local/age must have mode 0700"
[ "$(stat -f '%Lp' "$identity")" = 600 ] || die "$identity must have mode 0600"
git -C "$repo_root" check-ignore -q .local/age/identity.txt || die "$identity must be ignored by Git"
if git -C "$repo_root" ls-files --error-unmatch .local/age/identity.txt >/dev/null 2>&1; then
  die "$identity must never be tracked by Git"
fi

exec task --dir "$repo_root" bootstrap
