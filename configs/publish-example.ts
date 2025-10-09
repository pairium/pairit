import { compileYamlToCanonicalJson } from '../packages/core/src/index';
import { promises as fs } from 'node:fs';
import path from 'node:path';

async function main() {
  const sourcePath = path.resolve('configs/simple-survey.yaml');
  const outputPath = path.resolve('configs/simple-survey.json');
  const yamlSource = await fs.readFile(sourcePath, 'utf8');
  const compiled = compileYamlToCanonicalJson(yamlSource);
  await fs.writeFile(outputPath, JSON.stringify(compiled, null, 2));
  console.log(`Compiled to ${outputPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
