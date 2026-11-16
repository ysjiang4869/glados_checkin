import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { checkinInPage } from '../browser-checkin.js'

for (const rejected of [false, true]) {
  test(`official page submits its own challenge result (rejected=${rejected})`, async () => {
    const browser = await chromium.launch({
      executablePath: process.env.GLADOS_TEST_CHROMIUM_EXECUTABLE || undefined,
      headless: true,
    })
    try {
      const page = await browser.newPage()
      let submitted
      await page.route('https://fixture.example/**', async (route) => {
        const path = new URL(route.request().url()).pathname
        if (path === '/console/checkin') {
          // Local fixture only: stands in for the website's own verification component.
          return route.fulfill({contentType: 'text/html', body: `<button class="ckb" disabled>Check in</button><script>
            let challenge;
            fetch('/api/user/checkin/challenge').then(r=>r.json()).then(c=>{challenge=c;document.querySelector('button').disabled=false});
            document.querySelector('button').onclick=()=>fetch('/api/user/checkin',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({nonce:challenge.nonce,proof:'fixture-proof',tsState:'ok',turnstile:'fixture-token'})});
          </script>`})
        }
        if (path.endsWith('/challenge')) return route.fulfill({json: {code: 0, nonce: 'browser-nonce', turnstile: {sitekey: 'fixture'}}})
        if (path === '/api/user/checkin') {
          submitted = route.request().postDataJSON()
          return route.fulfill({json: rejected ? {code: 5, reason: 'turnstile'} : {code: 0, points: 10}})
        }
        throw new Error('Unexpected URL')
      })
      const result = await checkinInPage(page, 'fixture.example')
      assert.equal(result.code, rejected ? 5 : 0)
      assert.deepEqual(submitted, {nonce: 'browser-nonce', proof: 'fixture-proof', tsState: 'ok', turnstile: 'fixture-token'})
    } finally {
      await browser.close()
    }
  })
}
