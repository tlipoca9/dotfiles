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

### create new user
```bash
sudo useradd <username>
sudo passwd <username>
```

### add it to wheel group
```bash
sudo usermod -aG wheel <username>
```

### ensure that the wheel group can use sudo without password
```bash
sudo cat /etc/sudoers | grep -E '^%wheel\s+ALL=\(ALL\)\s+NOPASSWD:\s+ALL' || echo '%wheel ALL=(ALL) NOPASSWD: ALL' | sudo tee -a /etc/sudoers
```