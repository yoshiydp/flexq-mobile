#!/bin/bash

LAMBDA_DIR="./api/lambda"
DIST_DIR="./dist"

mkdir -p $DIST_DIR

# Lambda 関数一覧
FUNCTIONS=(
  "get-data"
  "get-memo"
  "get-project"
  "get-project-detail"
  "get-project-records"
  "get-profile"
  "get-record"
  "get-track"
  "post-auth-login"
  "post-auth-logout"
)

for fn in "${FUNCTIONS[@]}"; do
  echo "Deploying $fn ..."
  mkdir -p $DIST_DIR/$fn

  cp $LAMBDA_DIR/$fn.ts $DIST_DIR/$fn/
  cp $LAMBDA_DIR/utils.ts $DIST_DIR/$fn/
  cp $LAMBDA_DIR/package.json $DIST_DIR/$fn/

  cd $DIST_DIR/$fn
  zip -r function.zip .
  aws lambda update-function-code --function-name $fn --zip-file fileb://function.zip
  cd ../../..
done

echo "🚀 All functions deployed!"
