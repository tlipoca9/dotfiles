# dotfiles

## init

### https

```bash
sh -c "$(curl -fsLS get.chezmoi.io)" -- init --apply https://github.com/tlipoca9/dotfiles.git
```

### ssh

```bash
sh -c "$(curl -fsLS get.chezmoi.io)" -- init --apply git@github.com:tlipoca9/dotfiles.git
```

## init with new user (linux)

### create new sudoers without password
```bash
./.scripts/sudoeradd.sh
```
