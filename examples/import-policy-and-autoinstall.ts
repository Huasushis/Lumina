/// <reference types="node" />

import { Sandbox } from '../src/index.js';

async function testDenyPolicy() {
  try {
    await Sandbox.runCode(
      `
const path = require('node:path');
return path.basename('/tmp/a.txt');
`,
      {},
      new Map(),
      {
        clone: async () => null,
        create: async () => null
      },
      undefined,
      {
        language: 'typescript',
        importPolicy: 'deny'
      }
    );

    console.log('deny policy => unexpected success');
  } catch (err) {
    console.log('deny policy => blocked as expected:', (err as Error).message);
  }
}

async function testAllPolicy() {
  const result = await Sandbox.runCode(
    `
const path = require('node:path');
return path.basename('/tmp/a.txt');
`,
    {},
    new Map(),
    {
      clone: async () => null,
      create: async () => null
    },
    undefined,
    {
      language: 'typescript',
      importPolicy: 'all',
      autoInstallMissingPackages: true
    }
  );

  console.log('all policy =>', result);
}

async function main() {
  await testDenyPolicy();
  await testAllPolicy();

  console.log('Tip: allowlist/all can auto-install missing external packages when enabled.');
}

main().catch((err) => {
  console.error('import-policy-and-autoinstall failed:', err);
  process.exit(1);
});
