{{ if eq .chezmoi.os "linux" -}}
#!/usr/bin/env bash
{{ if eq .chezmoi.username "root" -}}
echo "Please Input the username you want to add: "
read username
useradd $username
passwd $username
echo "$username ALL=(ALL) NOPASSWD: ALL" >> /etc/sudoers
{{ else -}}
echo "This script must be run as root"
{{ end -}}
