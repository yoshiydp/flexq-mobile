const fs = require('fs');
const path = require('path');
const tsx = require('tsx/cjs/api');

const SRC_DATA = path.resolve(process.cwd(), 'src/data');
const OUT_DIR = path.resolve(process.cwd(), '.lambda-build');

(async () => {
  const dataFiles = fs.readdirSync(SRC_DATA).filter((f) => f.endsWith('.ts'));
  const lambdaDirs = fs.readdirSync(OUT_DIR);

  for (const dataFile of dataFiles) {
    const name = dataFile.replace(/Data\.ts$/, '').toLowerCase();
    const mod = await tsx.import(path.join(SRC_DATA, dataFile));
    const value = Object.values(mod)[0];

    for (const lambda of lambdaDirs) {
      const mockDir = path.join(OUT_DIR, lambda, 'mock');
      fs.mkdirSync(mockDir, { recursive: true });

      fs.writeFileSync(
        path.join(mockDir, `${name}.js`),
        `module.exports = ${JSON.stringify(value, null, 2)};`,
      );
    }
  }

  console.log('✅ mock generated');
})();
