import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';
import path from 'path';
import fs from 'fs';

const app = express();
app.use(cors());
app.use(express.json());

app.use(
  '/audio',
  express.static(path.resolve(__dirname, '../src/assets/audio')),
);

app.use(
  '/images',
  express.static(path.resolve(__dirname, '../src/assets/images')),
);

app.use(
  '/record',
  express.static(path.resolve(__dirname, '../src/assets/record')),
);

const openapiPath = path.resolve(__dirname, '../api/openapi.yaml');

if (!fs.existsSync(openapiPath)) {
  console.error(
    'openapi.yaml が見つかりません。先に yarn generate:openapi を実行してください。',
  );
  process.exit(1);
}

const swaggerDocument = YAML.load(openapiPath);

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

swaggerDocument.paths &&
  Object.keys(swaggerDocument.paths).forEach((route) => {
    const getRoute = swaggerDocument.paths[route].get;
    if (getRoute?.responses?.['200']?.content?.['application/json']?.examples) {
      const exampleKey = Object.keys(
        getRoute.responses['200'].content['application/json'].examples,
      )[0];
      const example =
        swaggerDocument.components.examples[exampleKey]?.value || {};

      // ✅ `/data/project/{id}` のような動的パス対応
      const expressRoute = route.replace('{id}', ':id');

      app.get(expressRoute, (req, res) => {
        res.json(example);
      });

      console.log(`Mock endpoint ready: GET ${expressRoute}`);
    }
  });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(
    `🚀 Swagger Mock Server running at http://localhost:${PORT}/api-docs`,
  );
});
