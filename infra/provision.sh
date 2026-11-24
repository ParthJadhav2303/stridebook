#!/usr/bin/env bash
# Creates all StrideBook Azure resources. Run once from your laptop (or Azure Cloud Shell).
#
# Prereqs: Azure CLI logged in (`az login`), the new Pay-As-You-Go subscription selected
#          (`az account set -s <subscription-id>`), and an SSH key (~/.ssh/id_ed25519.pub).
#
# Usage:  ADMIN_IP=$(curl -s https://ifconfig.me) ./infra/provision.sh
set -euo pipefail

LOCATION="${LOCATION:-centralindia}"
RG="${RG:-rg-stridebook}"
VM="${VM:-vm-stridebook}"
VM_SIZE="${VM_SIZE:-Standard_B2ats_v2}"
ADMIN_USER="stride"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519.pub}"
ADMIN_IP="${ADMIN_IP:?Set ADMIN_IP to your public IP, e.g. ADMIN_IP=\$(curl -s https://ifconfig.me)}"
SUFFIX="${SUFFIX:-$(openssl rand -hex 3)}"
DNS_LABEL="${DNS_LABEL:-stridebook-$SUFFIX}"
STORAGE="${STORAGE:-stridebk$SUFFIX}"
TAGS="project=stridebook"
HERE="$(cd "$(dirname "$0")" && pwd)"

[ -f "$SSH_KEY" ] || { echo "SSH public key not found at $SSH_KEY (create one: ssh-keygen -t ed25519)"; exit 1; }

echo "Subscription: $(az account show --query name -o tsv)"
read -rp "Create StrideBook resources in $LOCATION ($RG)? [y/N] " ok
[[ "$ok" =~ ^[Yy]$ ]] || exit 1

echo "==> Resource group"
az group create -n "$RG" -l "$LOCATION" --tags $TAGS -o none

echo "==> VM ($VM_SIZE, Ubuntu 24.04, 32 GB Standard SSD)"
az vm create -g "$RG" -n "$VM" -l "$LOCATION" --tags $TAGS \
  --image Canonical:ubuntu-24_04-lts:server:latest \
  --size "$VM_SIZE" \
  --admin-username "$ADMIN_USER" --ssh-key-values "$SSH_KEY" \
  --os-disk-size-gb 32 --storage-sku StandardSSD_LRS \
  --public-ip-sku Standard --public-ip-address-dns-name "$DNS_LABEL" \
  --nsg-rule NONE \
  --custom-data "$HERE/cloud-init.yaml" -o none

NSG="${VM}NSG"
echo "==> Firewall: 80/443 from anywhere, SSH only from $ADMIN_IP"
az network nsg rule create -g "$RG" --nsg-name "$NSG" -n allow-web --priority 100 \
  --access Allow --protocol '*' --direction Inbound --destination-port-ranges 80 443 -o none
az network nsg rule create -g "$RG" --nsg-name "$NSG" -n allow-ssh-admin --priority 110 \
  --access Allow --protocol Tcp --direction Inbound --destination-port-ranges 22 \
  --source-address-prefixes "$ADMIN_IP" -o none

echo "==> Storage for backups ($STORAGE, Cool tier, private)"
az storage account create -g "$RG" -n "$STORAGE" -l "$LOCATION" --tags $TAGS \
  --sku Standard_LRS --kind StorageV2 --access-tier Cool \
  --min-tls-version TLS1_2 --allow-blob-public-access false -o none
KEY=$(az storage account keys list -g "$RG" -n "$STORAGE" --query '[0].value' -o tsv)
az storage container create --name backups --account-name "$STORAGE" --account-key "$KEY" -o none

az storage account management-policy create -g "$RG" --account-name "$STORAGE" --policy @- -o none <<'JSON'
{ "rules": [
  { "name": "expire-daily", "enabled": true, "type": "Lifecycle",
    "definition": { "filters": { "blobTypes": ["blockBlob"], "prefixMatch": ["backups/daily/"] },
      "actions": { "baseBlob": { "delete": { "daysAfterModificationGreaterThan": 35 } } } } },
  { "name": "expire-monthly", "enabled": true, "type": "Lifecycle",
    "definition": { "filters": { "blobTypes": ["blockBlob"], "prefixMatch": ["backups/monthly/"] },
      "actions": { "baseBlob": { "delete": { "daysAfterModificationGreaterThan": 400 } } } } }
] }
JSON

# Write-only SAS (create + write), valid 2 years. Renew before expiry (see runbook).
EXPIRY=$(date -u -d "+2 years" +%Y-%m-%dT%H:%MZ 2>/dev/null || date -u -v+2y +%Y-%m-%dT%H:%MZ)
SAS=$(az storage container generate-sas --name backups --account-name "$STORAGE" --account-key "$KEY" \
  --permissions cw --expiry "$EXPIRY" --https-only -o tsv)

FQDN=$(az network public-ip show -g "$RG" -n "${VM}PublicIP" --query dnsSettings.fqdn -o tsv)

cat <<EOF

Done. Put these in /opt/stridebook/.env on the VM:

  SITE_ADDRESS=$FQDN
  BACKUP_CONTAINER_URL=https://$STORAGE.blob.core.windows.net/backups
  BACKUP_SAS=$SAS

SSH:  ssh $ADMIN_USER@$FQDN
Backup SAS expires: $EXPIRY
Next: create the budget alert in the portal, then follow docs/runbook.md step 4.
EOF
