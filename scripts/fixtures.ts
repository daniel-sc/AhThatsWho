import { writeFileSync } from 'node:fs';
import { fixtures } from '../src/domain/fixtures';
const count = Number(process.argv[2] || 500);
if (!Number.isInteger(count) || count < 1 || count > 10000)
  throw new Error('Choose 1–10000 households');
const path = process.argv[3] || '/tmp/ahthatswho-synthetic.json';
writeFileSync(path, JSON.stringify(fixtures(count), null, 2));
console.log(`Wrote ${count} synthetic households to ${path}`);
