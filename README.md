# dotfiles

## init

### https

```bash
sh -c "$(curl -fsLS get.chezmoi.io)" -- -b $HOME/.local/bin init --apply https://github.com/tlipoca9/dotfiles.git
```

### ssh

```bash
sh -c "$(curl -fsLS get.chezmoi.io)" -- -b $HOME/.local/bin init --apply git@github.com:tlipoca9/dotfiles.git
```

## init with new user (linux)

### configure proxy
```bash
PROXY_ADDRESS="http://<proxy_address>:<proxy_port>"
export HTTP_PROXY=$PROXY_ADDRESS
export HTTPS_PROXY=$PROXY_ADDRESS
echo "export HTTP_PROXY=$PROXY_ADDRESS" >> /etc/bashrc
echo "export HTTPS_PROXY=$PROXY_ADDRESS" >> /etc/bashrc
echo "export HTTP_PROXY=$PROXY_ADDRESS" >> /etc/zshrc
echo "export HTTPS_PROXY=$PROXY_ADDRESS" >> /etc/zshrc
```

### create new sudoers without password
```bash
./.scripts/sudoeradd.sh
```

### change login shell
```bash
sudo su <new_user>
sudo cat /etc/shells | grep "$(command -v zsh)" || sudo echo "$(command -v zsh)" | sudo tee -a /etc/shells
chsh -s "$(command -v zsh)"
```

### copy ssh authorized_keys (optional)
```bash
sudo su <new_user>
mkdir -p ~/.ssh
sudo cp /root/.ssh/authorized_keys ~/.ssh/
sudo chmod 644 ~/.ssh/authorized_keys
```
