#!/usr/bin/env bash
# アカウント停止（BAN）の E2E 実行ラッパー (TASK-81)
#
# BAN の切り替えは API ではなく scripts/ban-user.ts（DynamoDB 直接更新）で行うため、
# Maestro の runScript（http のみ）からは実行できない。そこでこのスクリプトが
#   1. E2E 専用アカウント（E2E_BAN_EMAIL）を BAN
#   2. .maestro/flows/25-account-suspension/ のフローを実行
#   3. 成否にかかわらず BAN を解除（trap）
# の順に実行する。demo@example.com を BAN すると他の全 E2E が巻き添えになるため、
# 必ず専用アカウントを使う（dev に e2e-ban@example.com / password123 を登録しておく）。
#
# 使い方（yarn start + シミュレーター起動済みが前提。AWS 認証情報は dev 開発者アカウント）:
#   scripts/e2e-ban.sh                          # dev（lyrics-dev-api）で AS フローを実行
#   MAESTRO_DEVICE=emulator-5554 scripts/e2e-ban.sh   # デバイスを明示
#   USERS_TABLE=<テーブル名> scripts/e2e-ban.sh        # テーブル名を直接指定（CloudFormation 参照を省略）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

STACK_NAME="${STACK_NAME:-lyrics-dev-api}"
AWS_REGION="${AWS_REGION:-ap-northeast-1}"
E2E_BAN_EMAIL="${E2E_BAN_EMAIL:-e2e-ban@example.com}"
FLOW_DIR=".maestro/flows/25-account-suspension"

if [ -z "${USERS_TABLE:-}" ]; then
  USERS_TABLE="$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$AWS_REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='UsersTableName'].OutputValue" --output text)"
fi
if [ -z "$USERS_TABLE" ] || [ "$USERS_TABLE" = "None" ]; then
  echo "Users テーブル名を取得できませんでした（STACK_NAME=$STACK_NAME）" >&2
  exit 1
fi
export USERS_TABLE AWS_REGION

ban_user() { npx tsx scripts/ban-user.ts "$E2E_BAN_EMAIL" "$@"; }

unban() {
  echo "--- BAN 解除: $E2E_BAN_EMAIL"
  ban_user --unban || echo "!! BAN 解除に失敗しました。手動で実行してください: USERS_TABLE=$USERS_TABLE npx tsx scripts/ban-user.ts $E2E_BAN_EMAIL --unban" >&2
}

echo "--- BAN: $E2E_BAN_EMAIL (table: $USERS_TABLE)"
ban_user
trap unban EXIT

MAESTRO_ARGS=()
if [ -n "${MAESTRO_DEVICE:-}" ]; then
  MAESTRO_ARGS+=(--device "$MAESTRO_DEVICE")
fi

echo "--- Maestro: $FLOW_DIR"
maestro "${MAESTRO_ARGS[@]+"${MAESTRO_ARGS[@]}"}" test "$FLOW_DIR" "$@"
