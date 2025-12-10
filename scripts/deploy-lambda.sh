set -e

LAMBDA_ZIP=lambda.zip
REGION=ap-southeast-2

FUNCTIONS=(
  get-data
  get-memo
  get-profile
  get-project
  get-project-detail
  get-project-records
  get-record
  get-track
  post-auth-login
  post-auth-logout
)

for fn in "${FUNCTIONS[@]}"; do
  echo "🚀 Updating $fn"
  aws lambda update-function-code \
    --function-name "$fn" \
    --zip-file "fileb://$LAMBDA_ZIP" \
    --region "$REGION"
done

echo "✅ Lambda deployment completed"
