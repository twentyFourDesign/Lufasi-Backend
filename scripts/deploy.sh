#!/bin/bash
set -e
set -o pipefail

echo "Starting deploy..."

mkdir -p ~/.ssh
echo "$SSH_PRIVATE_KEY" | tr -d '\r' > ~/.ssh/id_ed25519
chmod 600 ~/.ssh/id_ed25519

eval "$(ssh-agent -s)"
ssh-add ~/.ssh/id_ed25519

ssh-keyscan -H "$DO_HOST" >> ~/.ssh/known_hosts

ssh -i ~/.ssh/id_ed25519 \
    -o PubkeyAcceptedKeyTypes=+ssh-ed25519 \
    -o StrictHostKeyChecking=no \
    -tt $DO_USER@$DO_HOST << 'EOF'
cd /home/deploy/apps/Lufasi-Backend
git pull origin main
npm install --production
pm2 reload lufasi-backend
EOF

echo "Deploy finished successfully!"
