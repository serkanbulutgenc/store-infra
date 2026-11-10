#!/usr/bin/env bash
# Harden a fresh Debian/Ubuntu VPS and install Docker. Run ONCE as root, from a second
# terminal while the first root session stays open:
#
#   sudo DEPLOY_USER=deploy scripts/server-baseline.sh
#
# Does: a deploy user (docker group, your SSH key), SSH keys only and no root login,
# ufw allowing only 22/80/443, unattended security updates, fail2ban, Docker Engine.
# Safe to run again. Refuses to turn password login off until the deploy user has
# a key, so it cannot lock you out. Postgres and Redis are not published by the
# Compose file; scripts/check-ports.sh proves it from outside.
set -euo pipefail

DEPLOY_USER=${DEPLOY_USER:-deploy}
SSH_PORT=${SSH_PORT:-22}
[ "$(id -u)" -eq 0 ] || { echo "run as root (sudo)" >&2; exit 1; }
export DEBIAN_FRONTEND=noninteractive

echo "== packages"
apt-get update -qq
apt-get install -y -qq ufw fail2ban unattended-upgrades ca-certificates curl gnupg

echo "== deploy user $DEPLOY_USER"
id "$DEPLOY_USER" >/dev/null 2>&1 || adduser --disabled-password --gecos "" "$DEPLOY_USER"
home=$(getent passwd "$DEPLOY_USER" | cut -d: -f6)
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$home/.ssh"
keys="$home/.ssh/authorized_keys"
if [ ! -s "$keys" ] && [ -s /root/.ssh/authorized_keys ]; then
  install -m 600 -o "$DEPLOY_USER" -g "$DEPLOY_USER" /root/.ssh/authorized_keys "$keys"
fi
[ -s "$keys" ] || {
  echo "no SSH key for $DEPLOY_USER: put your public key in $keys and run again" >&2
  exit 1
}

echo "== docker"
if ! command -v docker >/dev/null; then
  . /etc/os-release
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL "https://download.docker.com/linux/$ID/gpg" -o /etc/apt/keyrings/docker.asc
  echo "deb [signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/$ID ${VERSION_CODENAME} stable" \
    >/etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
fi
usermod -aG docker "$DEPLOY_USER"

echo "== sshd: keys only, no root"
cat >/etc/ssh/sshd_config.d/00-store-hardening.conf <<CONF
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
AuthenticationMethods publickey
MaxAuthTries 3
CONF
sshd -t
systemctl reload ssh 2>/dev/null || systemctl reload sshd

echo "== firewall: $SSH_PORT, 80, 443"
ufw --force reset >/dev/null
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow "$SSH_PORT/tcp" >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw allow 443/udp >/dev/null  # HTTP/3, published by Caddy
ufw --force enable >/dev/null
# Docker's published ports bypass ufw, so the real guard is that only Caddy publishes any.

echo "== unattended security updates"
cat >/etc/apt/apt.conf.d/20auto-upgrades <<CONF
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
CONF
systemctl enable --now unattended-upgrades >/dev/null

echo "== fail2ban"
cat >/etc/fail2ban/jail.d/sshd.local <<CONF
[sshd]
enabled = true
port = $SSH_PORT
maxretry = 4
findtime = 10m
bantime = 1h
CONF
systemctl enable --now fail2ban >/dev/null
systemctl restart fail2ban

echo "== done"
echo "Test a NEW terminal now: ssh $DEPLOY_USER@<server>, before closing this session."
echo "Then: git clone store-infra as $DEPLOY_USER, scripts/init-env.sh, scripts/deploy.sh <tag>."
