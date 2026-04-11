#!/bin/bash
set -eo pipefail

# Enable Corepack so EAS Build uses Yarn 4 (Berry) specified in packageManager field
corepack enable
corepack prepare yarn@4.12.0 --activate
