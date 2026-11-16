import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'

const run = (scenario) => {
  const script = `
    const scenario = ${JSON.stringify(scenario)};
    globalThis.setTimeout = (fn) => { queueMicrotask(fn); return 0 };
    globalThis.fetch = async (url) => {
      const path = new URL(url).pathname;
      console.log('MOCK_REQUEST', path);
      let body;
      if (path.endsWith('/challenge')) body = {code: 0, nonce: 'test-nonce', ...(scenario === 'required' ? {turnstile: {sitekey: 'test'}} : {})};
      else if (path.endsWith('/checkin')) body = scenario === 'rejected' ? {code: 5, reason: 'turnstile'} : scenario === 'expired' ? {code: -2, message: '没有权限'} : {code: 1};
      else if (path.endsWith('/status')) body = {code: 0, data: {leftDays: 10}};
      else if (path.endsWith('/points')) body = {code: 0, points: 10, streak: 2};
      else if (path.endsWith('/iqi')) body = {code: 0};
      else throw new Error('Unexpected request: ' + path);
      return {ok: true, status: 200, json: async () => body};
    };
    await import('./main.js');
  `
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: new URL('..', import.meta.url), encoding: 'utf8',
    env: { PATH: process.env.PATH, GLADOS: 'gld:sess=test; gld:sess.sig=test', NOTIFY: 'console:log', AUTO_EXCHANGE: 'false', GLADOS_CHECKIN_MODE: 'http' },
  })
  return { status: result.status, output: result.stdout + result.stderr }
}

test('Turnstile requirement stops submission, sends notice and fails the job', () => {
  const result = run('required')
  assert.equal(result.status, 1)
  assert.match(result.output, /reason=turnstile/)
  assert.match(result.output, /控制台输出完成/)
  assert.doesNotMatch(result.output, /MOCK_REQUEST \/api\/user\/checkin\n/)
})

test('server Turnstile rejection reports actionable failure', () => {
  const result = run('rejected')
  assert.equal(result.status, 1)
  assert.match(result.output, /浏览器完成验证和签到/)
  assert.match(result.output, /成功 0 个 \| 失败 1 个/)
})

test('other account failures also fail the job after notification', () => {
  const result = run('expired')
  assert.equal(result.status, 1)
  assert.match(result.output, /没有权限/)
  assert.match(result.output, /控制台输出完成/)
})

test('already checked in remains successful without Turnstile', () => {
  const result = run('already')
  assert.equal(result.status, 0, result.output)
  assert.match(result.output, /成功 1 个 \| 失败 0 个/)
})
