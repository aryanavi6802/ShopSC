#!/usr/bin/env bash
# Provision Shop-SC on AWS with the AWS CLI. Safe to re-run: existing resources are reused.
#
#   aws login                      # browser sign-in, no access keys needed (AWS CLI v2.32+)
#   ./deploy/aws-provision.sh
#
# Creates: SSH key pair (saved to ~/.ssh/shopsc-key.pem), security group (22/80/443), Elastic IP,
# and a t3.micro Ubuntu 24.04 instance that clones the repo and runs deploy/setup-ec2.sh on first boot.
# If the GitHub CLI is logged in, it also sets the Actions secrets/variables that turn on auto-deploy.
set -euo pipefail

REGION="${AWS_REGION:-us-east-2}"
NAME="${NAME:-shopsc}"
INSTANCE_TYPE="${INSTANCE_TYPE:-t3.micro}"
GH_REPO="${GH_REPO:-aryanavi6802/ShopSC}"
REPO_URL="https://github.com/${GH_REPO}.git"
KEY_NAME="${NAME}-key"
KEY_FILE="$HOME/.ssh/${KEY_NAME}.pem"
export AWS_REGION="$REGION" AWS_DEFAULT_REGION="$REGION" AWS_PAGER=""

command -v aws >/dev/null || { echo "AWS CLI not found. Install it: brew install awscli"; exit 1; }
if ! aws sts get-caller-identity >/dev/null 2>&1; then
  echo "Not signed in to AWS. Run:  aws login   (choose region $REGION), then re-run this script."
  exit 1
fi
echo "==> AWS account $(aws sts get-caller-identity --query Account --output text), region $REGION"

echo "==> SSH key pair"
if aws ec2 describe-key-pairs --key-names "$KEY_NAME" >/dev/null 2>&1; then
  [ -f "$KEY_FILE" ] || { echo "Key pair $KEY_NAME exists in AWS but $KEY_FILE is missing. Delete the key pair in AWS (aws ec2 delete-key-pair --key-name $KEY_NAME) and re-run."; exit 1; }
else
  mkdir -p "$HOME/.ssh"
  aws ec2 create-key-pair --key-name "$KEY_NAME" --key-type ed25519 --query KeyMaterial --output text > "$KEY_FILE"
  chmod 400 "$KEY_FILE"
  echo "    saved $KEY_FILE"
fi

echo "==> Security group"
VPC_ID=$(aws ec2 describe-vpcs --filters Name=isDefault,Values=true --query 'Vpcs[0].VpcId' --output text)
[ "$VPC_ID" != "None" ] || { echo "No default VPC in $REGION"; exit 1; }
SG_ID=$(aws ec2 describe-security-groups --filters "Name=group-name,Values=${NAME}-sg" "Name=vpc-id,Values=$VPC_ID" --query 'SecurityGroups[0].GroupId' --output text)
if [ "$SG_ID" = "None" ]; then
  SG_ID=$(aws ec2 create-security-group --group-name "${NAME}-sg" --description "Shop-SC: HTTP/HTTPS public, SSH key-only" --vpc-id "$VPC_ID" --query GroupId --output text)
  # SSH stays open because GitHub Actions deploys from changing IPs; Ubuntu allows key-based login only.
  for port in 22 80 443; do
    aws ec2 authorize-security-group-ingress --group-id "$SG_ID" --protocol tcp --port "$port" --cidr 0.0.0.0/0 >/dev/null
  done
fi
echo "    $SG_ID"

echo "==> Elastic IP"
ALLOC_ID=$(aws ec2 describe-addresses --filters "Name=tag:Name,Values=$NAME" --query 'Addresses[0].AllocationId' --output text)
if [ "$ALLOC_ID" = "None" ]; then
  ALLOC_ID=$(aws ec2 allocate-address --domain vpc --tag-specifications "ResourceType=elastic-ip,Tags=[{Key=Name,Value=$NAME}]" --query AllocationId --output text)
fi
EIP=$(aws ec2 describe-addresses --allocation-ids "$ALLOC_ID" --query 'Addresses[0].PublicIp' --output text)
DOMAIN="${DOMAIN:-${EIP//./-}.sslip.io}"
echo "    $EIP  →  https://$DOMAIN"

echo "==> EC2 instance"
INSTANCE_ID=$(aws ec2 describe-instances --filters "Name=tag:Name,Values=$NAME" "Name=instance-state-name,Values=pending,running,stopping,stopped" --query 'Reservations[0].Instances[0].InstanceId' --output text)
if [ "$INSTANCE_ID" = "None" ]; then
  AMI_ID=$(aws ec2 describe-images --owners 099720109477 \
    --filters "Name=name,Values=ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*" "Name=state,Values=available" \
    --query 'sort_by(Images,&CreationDate)[-1].ImageId' --output text)
  USER_DATA=$(mktemp)
  cat > "$USER_DATA" <<EOF
#!/bin/bash
set -euxo pipefail
exec > /var/log/shopsc-setup.log 2>&1
export HOME=/root USER=ubuntu
apt-get update -y
apt-get install -y git curl openssl
git clone $REPO_URL /home/ubuntu/shopsc
cd /home/ubuntu/shopsc
./deploy/setup-ec2.sh $DOMAIN || echo "SETUP FAILED - see above"
chown -R ubuntu:ubuntu /home/ubuntu/shopsc
EOF
  INSTANCE_ID=$(aws ec2 run-instances --image-id "$AMI_ID" --instance-type "$INSTANCE_TYPE" \
    --key-name "$KEY_NAME" --security-group-ids "$SG_ID" --user-data "file://$USER_DATA" \
    --block-device-mappings 'DeviceName=/dev/sda1,Ebs={VolumeSize=20,VolumeType=gp3}' \
    --metadata-options HttpTokens=required \
    --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=$NAME}]" \
    --query 'Instances[0].InstanceId' --output text)
  rm -f "$USER_DATA"
  echo "    launched $INSTANCE_ID ($INSTANCE_TYPE, $AMI_ID)"
else
  echo "    reusing $INSTANCE_ID"
fi
aws ec2 wait instance-running --instance-ids "$INSTANCE_ID"
aws ec2 associate-address --allocation-id "$ALLOC_ID" --instance-id "$INSTANCE_ID" --allow-reassociation >/dev/null
echo "    running, Elastic IP attached"

if command -v gh >/dev/null && gh auth status >/dev/null 2>&1; then
  echo "==> GitHub Actions auto-deploy for $GH_REPO"
  gh secret set EC2_HOST -R "$GH_REPO" -b "$EIP"
  gh secret set EC2_USER -R "$GH_REPO" -b "ubuntu"
  gh secret set EC2_SSH_KEY -R "$GH_REPO" < "$KEY_FILE"
  gh variable set DOMAIN -R "$GH_REPO" -b "$DOMAIN"
  gh variable set DEPLOY_ENABLED -R "$GH_REPO" -b "true"
else
  echo "==> (gh not logged in: set the GitHub secrets manually, see deploy/DEPLOY.md step 6)"
fi

echo "==> Waiting for https://$DOMAIN (first build takes ~10 minutes on a t3.micro)"
for i in $(seq 1 60); do
  if curl -fsS --max-time 5 "https://$DOMAIN/api/health" >/dev/null 2>&1; then
    echo
    echo "LIVE: https://$DOMAIN"
    echo "SSH:  ssh -i $KEY_FILE ubuntu@$EIP"
    exit 0
  fi
  printf "."
  sleep 20
done
echo
echo "Not up yet. Check progress with:"
echo "  ssh -i $KEY_FILE ubuntu@$EIP 'tail -n 40 /var/log/shopsc-setup.log'"
exit 1
