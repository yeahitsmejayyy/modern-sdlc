#!/usr/bin/env bash
# One-time setup for a fresh Hostinger KVM 1 (Ubuntu 24.04 + Docker template).
#
# Run it from your laptop, as root on the server, passing the deploy public key:
#   ssh root@<ip> 'bash -s' -- "$(cat ~/.ssh/modern_sdlc_deploy.pub)" < scripts/bootstrap-vps.sh
#
# Safe to run again: every step checks the current state before changing it.
set -euo pipefail

# ssh joins the remote command into one string, so the key arrives split at its
# spaces ("ssh-ed25519" "AAAA..." "comment"). Join the words back together.
DEPLOY_KEY="$*"
[ -n "$DEPLOY_KEY" ] || { echo "usage: bootstrap-vps.sh '<deploy public key>'" >&2; exit 1; }
DEPLOY_USER=deploy
APP_DIR=/opt/modern-sdlc

# --- Docker -------------------------------------------------------------------
# The Hostinger template already has it; this covers a plain Ubuntu image.
if ! command -v docker >/dev/null 2>&1; then
  echo "Installing Docker Engine + compose plugin..."
  apt-get update
  apt-get install -y docker.io docker-compose-v2
  systemctl enable --now docker
fi

# --- Deploy user ----------------------------------------------------------------
# CI logs in as this user. It can run docker, and nothing else needs root.
if ! id "$DEPLOY_USER" >/dev/null 2>&1; then
  echo "Creating user $DEPLOY_USER..."
  useradd --create-home --shell /bin/bash "$DEPLOY_USER"
fi
usermod -aG docker "$DEPLOY_USER"

ssh_dir="/home/$DEPLOY_USER/.ssh"
keys="$ssh_dir/authorized_keys"
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$ssh_dir"
touch "$keys"
grep -qxF "$DEPLOY_KEY" "$keys" || echo "$DEPLOY_KEY" >> "$keys"
chown "$DEPLOY_USER:$DEPLOY_USER" "$keys"
chmod 600 "$keys"

# --- Firewall -------------------------------------------------------------------
# Only SSH and the web ports. Note: Docker's published ports skip ufw entirely,
# which is why compose.yaml binds Postgres to 127.0.0.1 instead of relying on this.
command -v ufw >/dev/null 2>&1 || apt-get install -y ufw
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# --- SSH: keys only ----------------------------------------------------------------
# Guard against locking yourself out: if root has no SSH key yet, skip this step.
# Add one (ssh-copy-id root@<ip>) and run the script again.
if [ -s /root/.ssh/authorized_keys ]; then
  # 00- sorts first, and sshd keeps the first value it reads for each setting.
  cat > /etc/ssh/sshd_config.d/00-keys-only.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
EOF
  sshd -t
  systemctl reload ssh
else
  echo "WARNING: root has no SSH key, so password login was left ON. Run ssh-copy-id root@<ip>, then re-run."
fi

# --- App directory ----------------------------------------------------------------
# The deploy workflow copies compose.yaml and writes .env here.
install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$APP_DIR"

echo "Done. Check it with: ssh -i ~/.ssh/modern_sdlc_deploy $DEPLOY_USER@<ip> docker ps"
