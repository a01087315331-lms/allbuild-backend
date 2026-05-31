const { chromium } = require('playwright');
async function run() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto('https://www.coupang.com/np/search?q=A4+%EB%B3%B5%EC%82%AC%EC%9A%A9%EC%A7%80+2500%EB%A7%A4');
    const html = await page.content();
    if(html.includes('search-product')) {
        console.log("Playwright Coupang 성공!");
    } else {
        console.log("Playwright Coupang 실패. HTML:", html.substring(0, 500));
    }
    await browser.close();
}
run();
