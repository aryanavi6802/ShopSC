#!/usr/bin/env bash
# One-time setup for a fresh Ubuntu 24.04 EC2 instance. Run from the cloned repo:
#   cd ~/shopsc && ./deploy/setup-ec2.sh            # uses <public-ip>.sslip.io as the domain
#   cd ~/shopsc && ./deploy/setup-ec2.sh shop.example.com
#
# Installs Docker, adds swap (Next.js builds need more than 1 GB RAM), writes .env.production with
# random secrets, then builds and starts the stack. Safe to re-run.
set -euo pipefail
cd "$(dirname "$0")/.."

DOMAIN_ARG="${1:-}"

echo "==> Installing Docker (if needed)"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sudo sh
fi
sudo usermod -aG docker "$USER" || true

echo "==> Ensuring 2 GB swap"
if ! swapon --show | grep -q /swapfile; then
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile >/dev/null
  sudo swapon /swapfile
  echo "/swapfile none swap sw 0 0" | sudo tee -a /etc/fstab >/dev/null
fi

if [ ! -f .env.production ]; then
  echo "==> Creating .env.production"
  if [ -z "$DOMAIN_ARG" ]; then
    TOKEN=$(curl -fsS -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 60")
    PUBLIC_IP=$(curl -fsS -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/public-ipv4)
    DOMAIN_ARG="${PUBLIC_IP//./-}.sslip.io"
  fi
  cp .env.production.example .env.production
  sed -i "s|^DOMAIN=.*|DOMAIN=${DOMAIN_ARG}|" .env.production
  sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$(openssl rand -hex 32)|" .env.production
  sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 24)|" .env.production
  chmod 600 .env.production
  echo "    Domain: ${DOMAIN_ARG}"
  echo "    Optional: add GROQ_API_KEY to .env.production for the AI chatbot, then re-run ./deploy/deploy.sh"
else
  echo "==> .env.production already exists, leaving it alone"
fi

echo "==> Building and starting (first build takes ~5-10 minutes on a t3.micro)"
sudo -E ./deploy/deploy.sh

DOMAIN_NOW=$(grep '^DOMAIN=' .env.production | cut -d= -f2)
echo
echo "Done. Open https://${DOMAIN_NOW}"
echo "(Log out and back in to run docker without sudo.)"
