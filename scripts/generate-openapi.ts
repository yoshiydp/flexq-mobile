/**
 * AWS対応版 OpenAPI Generator
 *
 * 🔹 API Gateway import 可能
 * 🔹 Lambda 連携用 Integration 自動生成
 * 🔹 `openapi-aws.yaml` を自動出力
 *
 * 使い方:
 *    AWS_REGION=ap-northeast-1 AWS_ACCOUNT_ID=xxxxxxxxxx node ./scripts/generate-openapi.ts
 */

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { pathToFileURL, fileURLToPath } from 'url';

// ======== AWS 環境変数 ==========
const AWS_REGION = process.env.AWS_REGION || 'ap-northeast-1';
const AWS_ACCOUNT_ID = process.env.AWS_ACCOUNT_ID || '';
const API_STAGE = process.env.API_STAGE || 'prod'; // dev/staging/prod

// ======== 画像・音声ファイルのrequire回避 ==========
[
  '.svg',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.mp3',
  '.wav',
  '.ico',
  '.m4a',
  '.mov',
  '.mp4',
  '.webm',
].forEach((ext) => {
  require.extensions[ext] = () => {};
});

// ======== PATH 定義 =============
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, '../src/data');
const OUTPUT_YAML = path.resolve(__dirname, '../api/openapi-aws.yaml'); // ← AWS用
const BASE_TEMPLATE = path.resolve(__dirname, '../api/templates/base.yaml');

async function loadTsModule(filePath: string) {
  const moduleUrl = pathToFileURL(filePath).href;
  const module = await import(moduleUrl);
  return module;
}

async function generateOpenAPI() {
  console.log('🔹 Generating AWS OpenAPI YAML...');

  // base.yaml 読み込み
  const baseYaml = yaml.load(fs.readFileSync(BASE_TEMPLATE, 'utf8')) as any;

  // ======== 1) AWSサーバー設定を追加 ==========
  baseYaml.servers = [
    {
      url: `https://${AWS_ACCOUNT_ID}.execute-api.${AWS_REGION}.amazonaws.com/${API_STAGE}`,
    },
  ];

  const files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith('.ts'));
  const dataEntries: Record<string, any> = {};

  for (const file of files) {
    const filePath = path.join(DATA_DIR, file);
    const mod = await loadTsModule(filePath);
    for (const [key, value] of Object.entries(mod)) {
      dataEntries[key] = value;
    }
  }

  // ======== components & paths 初期化 ==========
  baseYaml.components = baseYaml.components || {};
  baseYaml.components.examples = baseYaml.components.examples || {};
  baseYaml.paths = baseYaml.paths || {};

  // ======== data examples を追加 ==========
  for (const [key, value] of Object.entries(dataEntries)) {
    baseYaml.components.examples[key] = { value };
  }

  // ======== Lambda連携用 Integration Generator ==========
  const createAwsIntegration = (funcName: string, method: 'POST' | 'GET') => ({
    'x-amazon-apigateway-integration': {
      type: 'aws_proxy',
      httpMethod: 'POST',
      uri: `arn:aws:apigateway:${AWS_REGION}:lambda:path/2015-03-31/functions/arn:aws:lambda:${AWS_REGION}:${AWS_ACCOUNT_ID}:function:${funcName}/invocations`,
    },
  });

  // ======== PATH 生成 ==========
  for (const key of Object.keys(dataEntries)) {
    if (key === 'PROJECT_RECORD_LIST_DATA' || key === 'AUTH_DATA') continue;

    const endpointName = key.replace('_DATA', '').toLowerCase();
    const endpoint = `/data/${endpointName}`;
    const lambdaName = `get-${endpointName}`; // Lambda名 → get-hospital, get-user など

    baseYaml.paths[endpoint] = {
      get: {
        summary: `Get ${endpointName} data`,
        description: `Returns mock data for ${key}.`,
        operationId: `get${key.replace('_DATA', '')}`,
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': {
                examples: { [key]: { $ref: `#/components/examples/${key}` } },
              },
            },
          },
        },
        ...createAwsIntegration(lambdaName, 'GET'), // Lambda連携 ← NEW!!
      },
    };
  }

  // ======== 特殊エンドポイント: project/{id}/records ==========
  if (dataEntries.PROJECT_RECORD_LIST_DATA) {
    baseYaml.paths['/data/project/{id}/records'] = {
      get: {
        summary: 'Get record list for a specific project',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': {
                examples: {
                  PROJECT_RECORD_LIST_DATA: {
                    $ref: '#/components/examples/PROJECT_RECORD_LIST_DATA',
                  },
                },
              },
            },
          },
        },
        ...createAwsIntegration('get-project-records', 'GET'),
      },
    };
  }

  // ======== AUTH_DATA (POST) ==========
  if (dataEntries.AUTH_DATA) {
    baseYaml.paths['/data/auth/login'] = {
      post: {
        summary: 'Mock login authentication',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  email: { type: 'string' },
                  password: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': {
                examples: {
                  AUTH_DATA: { $ref: '#/components/examples/AUTH_DATA' },
                },
              },
            },
          },
        },
        ...createAwsIntegration('post-auth-login', 'POST'),
      },
    };
  }

  // ======== YAML出力 ==========
  const yamlStr = yaml.dump(baseYaml, { noRefs: true });
  fs.writeFileSync(OUTPUT_YAML, yamlStr, 'utf8');
  console.log(`🚀 AWS OpenAPI YAML successfully generated → ${OUTPUT_YAML}`);
}

generateOpenAPI().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
