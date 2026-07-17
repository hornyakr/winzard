#!/usr/bin/env node
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
const command = process.argv[2] ?? 'list';
const root = process.cwd();
const required = ['src/app','src/modules','src/platform','src/composition','prisma/schema.prisma','.env.example'];
async function check() { const failures: string[] = []; for (const item of required) { try { await access(path.join(root,item)); } catch { failures.push(item); } } const health = await readFile(path.join(root,'src/app/api/health/live/route.ts'),'utf8'); if (!health.includes('no-store')) failures.push('health cache policy'); return failures; }
const failures = await check();
if (command === 'list') console.log('about, doctor, check, env:check, security:check');
else if (['about','doctor','check','env:check','security:check'].includes(command)) { if (failures.length) { console.error(`FAIL: ${failures.join(', ')}`); process.exitCode = 1; } else console.log(`PASS: ${command}`); }
else { console.error(`Unknown or not yet implemented Forge command: ${command}`); process.exitCode = 2; }
