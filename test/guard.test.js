import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'

for (const changed of [false, true]) {
  test(`guard recognizes current baseline, alerts on new fields (changed=${changed})`, () => {
    const source = `"glados-observe-v1";"/user/checkin";"/user/checkin/challenge";nonce;proof;challenge;"device-mismatch";"challenges.cloudflare.com";turnstile;tsState;${changed ? 'captchaToken' : ''}`
    const script = `globalThis.fetch=async(url)=>({ok:true,text:async()=>url.endsWith('/console/checkin')?'/static/js/test.chunk.js':${JSON.stringify(source)}}); await import('./guard.js');`
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: new URL('..', import.meta.url), encoding: 'utf8', env: {PATH: process.env.PATH},
    })
    assert.equal(result.status, changed ? 1 : 0, result.stdout + result.stderr)
    assert.match(result.stdout, changed ? /captchatoken/ : /PASS/)
  })
}
