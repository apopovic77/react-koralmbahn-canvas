#!/usr/bin/env bash

#############################################
# Deployment Script
#
# Deploys the built application to the production server.
#############################################

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

REPO_PATH="${REPO_PATH:-{{REPO_ROOT}}}"
DEPLOY_PATH="${DEPLOY_PATH:-{{DEPLOY_PATH}}}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups}"
BACKUP_PREFIX="${BACKUP_PREFIX:-{{BACKUP_PREFIX}}}"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_PATH="$BACKUP_DIR/${BACKUP_PREFIX}-${TIMESTAMP}"

echo -e "${GREEN}🚀 Starting deployment process...${NC}"

echo -e "${YELLOW}📂 Navigating to repository...${NC}"
cd "$REPO_PATH"

echo -e "${YELLOW}⬇️  Pulling latest changes from {{MAIN_BRANCH}}...${NC}"
git fetch origin {{MAIN_BRANCH}}
git reset --hard origin/{{MAIN_BRANCH}}

echo -e "${YELLOW}📦 Installing dependencies...${NC}"
{{INSTALL_DEPS_COMMAND}}

echo -e "${YELLOW}🏗️  Building application...${NC}"
{{BUILD_COMMAND}}

if [ ! -d "$REPO_PATH/dist" ]; then
  echo -e "${RED}❌ Build failed: dist directory not found${NC}"
  exit 1
fi

if [ -d "$DEPLOY_PATH" ]; then
  echo -e "${YELLOW}💾 Creating backup...${NC}"
  mkdir -p "$BACKUP_DIR"
  cp -r "$DEPLOY_PATH" "$BACKUP_PATH"
  echo -e "${GREEN}✅ Backup created: $BACKUP_PATH${NC}"
else
  echo -e "${YELLOW}⚠️  No existing deployment found, skipping backup${NC}"
fi

echo -e "${YELLOW}🚢 Deploying new build...${NC}"
mkdir -p "$DEPLOY_PATH"
rsync -av --delete "$REPO_PATH/dist/" "$DEPLOY_PATH/"

echo -e "${YELLOW}🔒 Setting permissions...${NC}"
chown -R {{WEB_USER}}:{{WEB_GROUP}} "$DEPLOY_PATH"
chmod -R 755 "$DEPLOY_PATH"

echo -e "${GREEN}✅ Deployment completed successfully!${NC}"
echo -e "${GREEN}📍 Deployed to: $DEPLOY_PATH${NC}"
echo -e "${GREEN}💾 Backup saved: $BACKUP_PATH${NC}"
echo -e "${GREEN}🕒 Timestamp: $TIMESTAMP${NC}"

echo -e "\n${GREEN}📊 Deployment Summary:${NC}"
echo -e "  Repository: $REPO_PATH"
echo -e "  Deployment: $DEPLOY_PATH"
echo -e "  Backup: $BACKUP_PATH"
echo -e "  Files deployed:"
ls -lh "$DEPLOY_PATH" | tail -n +2
