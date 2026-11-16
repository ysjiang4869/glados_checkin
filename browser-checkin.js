import { chromium } from 'playwright'

// Let the official page run its own challenge, proof and Turnstile flow.
// Do not synthesize tokens or interact with the verification iframe.
export const checkinInPage = async (page, domain) => {
  const matches = (response, path, method) => {
    const url = new URL(response.url())
    return url.origin === `https://${domain}` && url.pathname === path &&
      response.request().method() === method
  }
  const challenge = page.waitForResponse(
    (response) => matches(response, '/api/user/checkin/challenge', 'GET'),
    { timeout: 60000 }
  ).then(async (response) => {
    if (!response.ok()) throw new Error(`浏览器 challenge HTTP ${response.status()}`)
    const body = await response.json()
    if (body.code !== 0 || !body.nonce) throw new Error(`浏览器登录/challenge 异常 (code=${body.code})，请更新 Cookie 与对应 UA`)
  })
  // Observe errors immediately while navigation runs to avoid unhandled rejections.
  await Promise.all([
    challenge,
    page.goto(`https://${domain}/console/checkin`, { waitUntil: 'domcontentloaded', timeout: 60000 }),
  ])
  const button = page.locator('button.ckb')
  await button.waitFor({ state: 'visible', timeout: 30000 })
  const result = page.waitForResponse(
    (response) => matches(response, '/api/user/checkin', 'POST'),
    { timeout: 120000 }
  ).then(async (response) => {
    if (!response.ok()) throw new Error(`浏览器签到 HTTP ${response.status()}`)
    return response.json()
  })
  const [action] = await Promise.all([result, button.click({ timeout: 30000 })])
  return action
}

export const browserCheckin = async (domain, headers) => {
  const browser = await chromium.launch({
    headless: process.env.GLADOS_BROWSER_HEADLESS !== 'false',
  })
  try {
    const context = await browser.newContext({ userAgent: headers['user-agent'] })
    const cookies = String(headers.cookie).split(';').map((part) => {
      const eq = part.indexOf('=')
      if (eq <= 0) return null
      return { name: part.slice(0, eq).trim(), value: part.slice(eq + 1).trim(), url: `https://${domain}` }
    }).filter(Boolean)
    await context.addCookies(cookies)
    const page = await context.newPage()
    const action = await checkinInPage(page, domain)
    // Preserve session rotations for subsequent status/points requests.
    headers.cookie = (await context.cookies(`https://${domain}`))
      .map(({ name, value }) => `${name}=${value}`).join('; ')
    return action
  } catch (error) {
    if (error.name === 'TimeoutError') {
      throw new Error('浏览器签到超时：可能需要人工完成 Cloudflare 验证、会话已失效或官网页面发生变化；未确认签到成功')
    }
    throw error
  } finally {
    await browser.close()
  }
}
