/**
 * AWS対応版 OpenAPI Generator（完全版 v2）
 * BOM除去 / ASCII化 / 日本語コメント除去 / YAML整形済み
 */

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { pathToFileURL, fileURLToPath } from 'url';

// ===== AWS ENV =====
const AWS_REGION = process.env.AWS_REGION || 'ap-northeast-1';
const AWS_ACCOUNT_ID = process.env.AWS_ACCOUNT_ID || 'YOUR_AWS_ACCOUNT_ID';
const API_STAGE = process.env.API_STAGE || 'dev';

// ===== 拡張子 require回避 =====
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, '../src/data');
const BASE_TEMPLATE = path.resolve(__dirname, '../api/templates/base.yaml');
const OUTPUT_YAML = path.resolve(__dirname, '../api/openapi-aws.yaml');
const OUTPUT_JSON = path.resolve(__dirname, '../api/openapi-aws.json');

// ===== 🔴 AWS用 クリーン関数（強化版） =====
const cleanForAws = (text: string): string => {
  return text
    .replace(/[^\x00-\x7F]/g, '') // 日本語・絵文字・全角完全除去
    .replace(/\uFEFF/g, '') // BOM削除
    .replace(/\t/g, '  ') // tab→space
    .replace(/\r\n/g, '\n') // CRLF→LF
    .replace(/\s+$/gm, '') // 行末スペース除去
    .trim();
};

async function loadTsModule(filePath: string) {
  const moduleUrl = pathToFileURL(filePath).href;
  return await import(moduleUrl);
}

async function generateOpenAPI() {
  console.log('🔷 Generating AWS OpenAPI...');

  // テンプレート読み込み
  let baseYaml = yaml.load(fs.readFileSync(BASE_TEMPLATE, 'utf8')) as any;
  baseYaml.servers = [
    {
      url: `https://${AWS_ACCOUNT_ID}.execute-api.${AWS_REGION}.amazonaws.com/${API_STAGE}`,
    },
  ];
  baseYaml.paths ||= {};
  baseYaml.components ||= {};
  baseYaml.components.examples ||= {};

  // ===== TSファイルから dataEntries 収集 =====
  const files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith('.ts'));
  const dataEntries: Record<string, any> = {};

  for (const file of files) {
    const mod = await loadTsModule(path.join(DATA_DIR, file));
    for (const [key, value] of Object.entries(mod)) dataEntries[key] = value;
  }

  // ===== Lambda ARN generator =====
  const createIntegration = (lambda: string) => ({
    'x-amazon-apigateway-integration': {
      type: 'aws_proxy',
      httpMethod: 'POST',
      uri: `arn:aws:apigateway:${AWS_REGION}:lambda:path/2015-03-31/functions/arn:aws:lambda:${AWS_REGION}:${AWS_ACCOUNT_ID}:function:${lambda}/invocations`,
    },
  });

  // ===== components.examples =====
  Object.entries(dataEntries).forEach(([key, val]) => {
    baseYaml.components.examples[key] = {
      value: cleanForAws(JSON.stringify(val, null, 2)),
    };
  });

  // ===== path 生成（一般GET） =====
  Object.keys(dataEntries).forEach((key) => {
    if (key === 'AUTH_DATA' || key === 'PROJECT_RECORD_LIST_DATA') return;

    const endpoint = key.replace('_DATA', '').toLowerCase();
    baseYaml.paths[`/data/${endpoint}`] = {
      get: {
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
        ...createIntegration(`get-${endpoint}`),
      },
    };
  });

  // ===== 特殊 path: project/{id}/records =====
  if (dataEntries.PROJECT_RECORD_LIST_DATA) {
    baseYaml.paths['/data/project/{id}/records'] = {
      get: {
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
        ...createIntegration('get-project-records'),
      },
    };
  }

  // ===== AUTH POST =====
  if (dataEntries.AUTH_DATA) {
    baseYaml.paths['/data/auth/login'] = {
      post: {
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
        ...createIntegration('post-auth-login'),
      },
    };
  }

  // ===== JSON/YAML 出力 =====
  const jsonOut = cleanForAws(JSON.stringify(baseYaml, null, 2));
  const yamlOut = cleanForAws(yaml.dump(baseYaml, { noRefs: true }));

  fs.writeFileSync(OUTPUT_JSON, jsonOut, 'utf8');
  fs.writeFileSync(OUTPUT_YAML, yamlOut, 'utf8');

  console.log(`✨ OK: ${OUTPUT_JSON}`);
  console.log(`✨ OK: ${OUTPUT_YAML}`);
}

generateOpenAPI().catch(console.error);
