#!/usr/bin/env bash
# Run on a Proxmox VE host (as root). Creates a small Debian LXC running nginx that
# serves this site and does a `git pull` from the repo every time the container boots.
#
# Usage:
#   ./proxmox-create-lxc.sh [-i CTID] [-n HOSTNAME] [-s STORAGE] [-b BRIDGE] [-r REPO_URL] [-B BRANCH] [-p ROOT_PASSWORD]
# Example:
#   ./proxmox-create-lxc.sh -i 210 -n statblock -s local-lvm
set -euo pipefail

CTID=$(pvesh get /cluster/nextid)
HOSTNAME=statblock
STORAGE=local-lvm          # container rootfs storage
TEMPLATE_STORAGE=local     # where CT templates live
BRIDGE=vmbr0
REPO=https://github.com/BehymerTech/DND-statblock-converter.git
BRANCH=main
PASSWORD=""

while getopts "i:n:s:b:r:B:p:" opt; do
	case $opt in
		i) CTID=$OPTARG ;; n) HOSTNAME=$OPTARG ;; s) STORAGE=$OPTARG ;; b) BRIDGE=$OPTARG ;;
		r) REPO=$OPTARG ;; B) BRANCH=$OPTARG ;; p) PASSWORD=$OPTARG ;;
		*) sed -n '2,9p' "$0"; exit 1 ;;
	esac
done

echo ">> Finding a Debian 12 template"
pveam update >/dev/null
TEMPLATE=$(pveam available --section system | awk '/debian-12-standard/ {print $2}' | sort -V | tail -1)
[ -n "$TEMPLATE" ] || { echo "No debian-12 template found"; exit 1; }
pveam list "$TEMPLATE_STORAGE" | grep -q "$TEMPLATE" || pveam download "$TEMPLATE_STORAGE" "$TEMPLATE"

echo ">> Creating CT $CTID ($HOSTNAME)"
pct create "$CTID" "$TEMPLATE_STORAGE:vztmpl/$TEMPLATE" \
	--hostname "$HOSTNAME" --cores 1 --memory 256 --swap 256 \
	--rootfs "$STORAGE:2" --unprivileged 1 --onboot 1 \
	--net0 "name=eth0,bridge=$BRIDGE,ip=dhcp" \
	${PASSWORD:+--password "$PASSWORD"}
pct start "$CTID"

echo ">> Waiting for network"
for _ in $(seq 1 30); do pct exec "$CTID" -- getent hosts deb.debian.org >/dev/null 2>&1 && break; sleep 2; done

echo ">> Installing nginx + git and cloning $REPO"
pct exec "$CTID" -- bash -c "apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nginx git ca-certificates >/dev/null && rm -rf /var/www/statblock && git clone --depth 1 --branch '$BRANCH' '$REPO' /var/www/statblock"

# nginx site: serve the repo root, never expose .git
TMP=$(mktemp -d)
cat > "$TMP/statblock.conf" <<'NGINX'
server {
	listen 80 default_server;
	root /var/www/statblock;
	index index.html;
	location ~ /\.git { deny all; }
	location / { try_files $uri $uri/ =404; add_header Cache-Control "no-cache"; }
	types { application/javascript mjs; }
}
NGINX

# systemd unit: pull the latest code on every boot, before nginx starts
cat > "$TMP/statblock-update.service" <<UNIT
[Unit]
Description=Pull latest stat block converter code
After=network-online.target
Wants=network-online.target
Before=nginx.service

[Service]
Type=oneshot
WorkingDirectory=/var/www/statblock
# Don't fail boot if GitHub is unreachable — keep serving the last good copy.
ExecStart=/bin/sh -c 'git fetch --depth 1 origin $BRANCH && git reset --hard origin/$BRANCH || true'
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
UNIT

pct push "$CTID" "$TMP/statblock.conf" /etc/nginx/conf.d/statblock.conf
pct push "$CTID" "$TMP/statblock-update.service" /etc/systemd/system/statblock-update.service
rm -rf "$TMP"
pct exec "$CTID" -- bash -c "rm -f /etc/nginx/sites-enabled/default && git config --global --add safe.directory /var/www/statblock && systemctl daemon-reload && systemctl enable statblock-update.service && systemctl restart nginx"

IP=$(pct exec "$CTID" -- hostname -I | awk '{print $1}')
echo
echo "Done. Browse to http://$IP/  (CT $CTID, $HOSTNAME)"
echo "Update on demand:  pct exec $CTID -- systemctl restart statblock-update   (or: pct reboot $CTID)"
