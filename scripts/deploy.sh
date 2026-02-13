#!/bin/bash
set -e

# Create SSH folder
mkdir -p ~/.ssh

# Save the private key from environment variable
echo "$SSH_PRIVATE_KEY" | tr -d '\r' > ~/.ssh/id_ed25519
chmod 600 ~/.ssh/id_ed25519

# Start SSH agent and add the key
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/id_ed25519

# Add the host to known_hosts
ssh-keyscan -H $DO_HOST >> ~/.ssh/known_hosts

# Connect and deploy
ssh -tt -o StrictHostKeyChecking=no -o PubkeyAcceptedKeyTypes=+ssh-ed25519 $DO_USER@$DO_HOST << 'EOF'
cd /home/deploy/apps/Lufasi-Backend
git pull origin main
npm install --production
pm2 reload lufasi-backend
EOF
