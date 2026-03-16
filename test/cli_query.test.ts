import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function runCli(args: string[], env: Record<string, string | undefined>) {
  const bin = path.join(process.cwd(), 'bin', 'lobster.js');
  return spawnSync('node', [bin, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

async function writeResumeState(stateDir: string, id: string) {
  await fsp.mkdir(stateDir, { recursive: true });
  await fsp.writeFile(
    path.join(stateDir, `workflow_resume_${id}.json`),
    JSON.stringify({
      filePath: '/tmp/test.lobster',
      resumeAtIndex: 1,
      steps: {},
      args: {},
      approvalStepId: 'approve',
      createdAt: '2026-03-16T20:00:00.000Z',
    }, null, 2),
    'utf8',
  );
}

test('status accepts flag-first tool mode before instance id', async () => {
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'lobster-cli-query-'));
  const stateDir = path.join(tmpDir, 'state');
  await writeResumeState(stateDir, 'run-123');

  const res = runCli(['status', '--mode', 'tool', 'run-123'], { LOBSTER_STATE_DIR: stateDir });

  assert.equal(res.status, 0);
  const out = JSON.parse(res.stdout);
  assert.equal(out.status, 'ok');
  assert.equal(out.output[0].id, 'run-123');
});

test('cancel accepts flag-first tool mode before instance id', async () => {
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'lobster-cli-query-'));
  const stateDir = path.join(tmpDir, 'state');
  await writeResumeState(stateDir, 'run-456');

  const res = runCli(['cancel', '--mode', 'tool', 'run-456'], { LOBSTER_STATE_DIR: stateDir });

  assert.equal(res.status, 0);
  const out = JSON.parse(res.stdout);
  assert.equal(out.status, 'ok');
  assert.deepEqual(out.output, [{ id: 'run-456', cancelled: true }]);
});
