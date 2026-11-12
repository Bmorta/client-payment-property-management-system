import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { migrationTemplate } from '../utils/migrationTemplates.js';

const output = resolve(process.cwd(), 'test/fixtures/migration-samples');
await mkdir(output, { recursive: true });
for (const type of ['clients', 'contracts', 'payments', 'down-payments', 'penalties', 'commissions']) {
  const workbook = migrationTemplate(type);
  await writeFile(resolve(output, `historical-${type}-EXAMPLE-ONLY.xlsx`), Buffer.from(await workbook.xlsx.writeBuffer()));
}
console.log(`Created six fictional, non-importable sample workbooks in ${output}`);
