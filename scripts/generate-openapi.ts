import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { pathToFileURL, fileURLToPath } from 'url';

const AWS_REGION = process.env.AWS_REGION || 'ap-northeast-1';
const AWS_ACCOUNT_ID = process.env.AWS_ACCOUNT_ID || 'YOUR_AWS_ACCOUNT_ID';
const API_STAGE = process.env.API_STAGE || 'dev';

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
].forEach((ext) => (require.extensions[ext] = () => {}));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, '../src/data');
const BASE_TEMPLATE = path.resolve(__dirname, '../api/templates/base.yaml');
const OUTPUT_YAML = path.resolve(__dirname, '../api/openapi-aws.yaml');
const OUTPUT_JSON = path.resolve(__dirname, '../api/openapi-aws.json');

const cleanForAws = (text: string): string => {
  return text
    .replace(/[^\x00-\x7F]/g, '')
    .replace(/\uFEFF/g, '')
    .replace(/\t/g, '  ')
    .replace(/\r\n/g, '\n')
    .replace(/\s+$/gm, '')
    .trim();
};

async function loadTsModule(filePath: string) {
  return await import(pathToFileURL(filePath).href);
}

async function generateOpenAPI() {
  console.log('🔷 Generating AWS OpenAPI...');

  let baseYaml = yaml.load(fs.readFileSync(BASE_TEMPLATE, 'utf8')) as any;

  baseYaml.servers = [
    {
      url: `https://${AWS_ACCOUNT_ID}.execute-api.${AWS_REGION}.amazonaws.com/${API_STAGE}`,
    },
  ];
  baseYaml.paths ||= {};
  baseYaml.components ||= {};
  baseYaml.components.examples ||= {};

  baseYaml['x-amazon-apigateway-api-key-source'] = 'HEADER';
  baseYaml['x-amazon-apigateway-gateway-responses'] = {
    DEFAULT_4XX: {
      statusCode: 400,
      responseTemplates: {
        'application/json': '{"message":$context.error.messageString}',
      },
    },
    DEFAULT_5XX: {
      statusCode: 500,
      responseTemplates: {
        'application/json': '{"message":$context.error.messageString}',
      },
    },
  };

  const files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith('.ts'));
  const dataEntries: Record<string, any> = {};

  for (const file of files) {
    const mod = await loadTsModule(path.join(DATA_DIR, file));
    for (const [key, val] of Object.entries(mod)) dataEntries[key] = val;
  }

  const default4xxResponse = {
    '400': {
      description: 'Bad Request',
      content: {
        'application/json': {
          example: { message: 'error' },
        },
      },
    },
  };

  const createIntegration = (lambda: string) => ({
    summary: `Invoke ${lambda}`,
    operationId: lambda.replace(/-/g, '_'),
    security: [],
    'x-amazon-apigateway-integration': {
      type: 'aws_proxy',
      httpMethod: 'POST',
      uri: `arn:aws:apigateway:${AWS_REGION}:lambda:path/2015-03-31/functions/arn:aws:lambda:${AWS_REGION}:${AWS_ACCOUNT_ID}:function:${lambda}/invocations`,
    },
  });

  Object.entries(dataEntries).forEach(([key, val]) => {
    baseYaml.components.examples[key] = {
      // 🔴 valueをJSONにした後ASCII化
      value: cleanForAws(JSON.stringify(val, null, 2)),
    };
  });

  Object.keys(dataEntries).forEach((key) => {
    if (key === 'AUTH_DATA' || key === 'PROJECT_RECORD_LIST_DATA') return;

    const endpoint = key.replace('_DATA', '').toLowerCase();
    baseYaml.paths[`/data/${endpoint}`] = {
      get: {
        summary: `Get ${endpoint} data`,
        operationId: `get_${endpoint}`,
        security: [],
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': {
                examples: { [key]: { $ref: `#/components/examples/${key}` } },
              },
            },
          },
          ...default4xxResponse,
        },
        ...createIntegration(`get-${endpoint}`),
      },
    };
  });

  if (dataEntries.PROJECT_RECORD_LIST_DATA) {
    baseYaml.paths[`/data/project/{id}/records`] = {
      get: {
        summary: 'Get project records',
        operationId: 'get_project_records',
        security: [],
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
          ...default4xxResponse,
        },
        ...createIntegration('get-project-records'),
      },
    };
  }

  if (dataEntries.AUTH_DATA) {
    baseYaml.paths['/data/auth/login'] = {
      post: {
        summary: 'Authenticate user',
        operationId: 'post_auth_login',
        security: [],
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
          ...default4xxResponse,
        },
        ...createIntegration('post-auth-login'),
      },
    };

    baseYaml.paths['/data/auth/register'] = {
      post: {
        summary: 'Register a new user',
        operationId: 'post_auth_register',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['username', 'email', 'password'],
                properties: {
                  username: { type: 'string' },
                  email: { type: 'string' },
                  password: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Created' },
          '400': { description: 'Bad Request' },
          '409': { description: 'Email already in use' },
        },
        ...createIntegration('post-auth-register'),
      },
    };

    baseYaml.paths['/data/auth/reset-password'] = {
      post: {
        summary: 'Reset user password',
        operationId: 'post_auth_reset_password',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'newPassword'],
                properties: {
                  email: { type: 'string' },
                  newPassword: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'OK' },
          '400': { description: 'Bad Request' },
          '404': { description: 'User not found' },
        },
        ...createIntegration('post-auth-reset-password'),
      },
    };
  }

  baseYaml.info.license = {
    name: 'MIT',
    url: 'https://opensource.org/licenses/MIT',
  };

  const jsonOut = cleanForAws(JSON.stringify(baseYaml, null, 2));
  const yamlOut = yaml.dump(baseYaml, { noRefs: true, lineWidth: -1 });

  fs.writeFileSync(OUTPUT_JSON, jsonOut, 'utf8');
  fs.writeFileSync(OUTPUT_YAML, yamlOut, 'utf8');

  console.log('✨ OpenAPI generated successfully');
  console.log(` → ${OUTPUT_JSON}`);
  console.log(` → ${OUTPUT_YAML}`);
}

generateOpenAPI().catch(console.error);
