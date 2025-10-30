import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { pathToFileURL, fileURLToPath } from 'url';

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
const OUTPUT_YAML = path.resolve(__dirname, '../api/openapi.yaml');
const BASE_TEMPLATE = path.resolve(__dirname, '../api/templates/base.yaml');

async function loadTsModule(filePath: string) {
  const moduleUrl = pathToFileURL(filePath).href;
  const module = await import(moduleUrl);
  return module;
}

async function generateOpenAPI() {
  console.log('Generating OpenAPI YAML...');

  const baseYaml = yaml.load(fs.readFileSync(BASE_TEMPLATE, 'utf8')) as any;

  const files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith('.ts'));
  const dataEntries: Record<string, any> = {};

  for (const file of files) {
    const filePath = path.join(DATA_DIR, file);
    const mod = await loadTsModule(filePath);
    for (const [key, value] of Object.entries(mod)) {
      dataEntries[key] = value;
    }
  }

  baseYaml.components = baseYaml.components || {};
  baseYaml.components.examples = baseYaml.components.examples || {};
  baseYaml.paths = baseYaml.paths || {};

  for (const [key, value] of Object.entries(dataEntries)) {
    baseYaml.components.examples[key] = { value };
  }

  for (const key of Object.keys(dataEntries)) {
    if (key === 'PROJECT_RECORD_LIST_DATA') continue;

    const endpointName = key.replace('_DATA', '').toLowerCase();
    const endpoint = `/data/${endpointName}`;

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
                examples: {
                  [key]: { $ref: `#/components/examples/${key}` },
                },
              },
            },
          },
        },
      },
    };
  }

  if (dataEntries.PROJECT_RECORD_LIST_DATA) {
    baseYaml.paths['/data/project/{id}/records'] = {
      get: {
        summary: 'Get record list for a specific project',
        description:
          'Returns record list data associated with a specific project.',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'Project ID',
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
      },
    };
  }

  const yamlStr = yaml.dump(baseYaml, { noRefs: true });
  fs.writeFileSync(OUTPUT_YAML, yamlStr, 'utf8');
  console.log('OpenAPI YAML updated:', OUTPUT_YAML);
}

generateOpenAPI().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
