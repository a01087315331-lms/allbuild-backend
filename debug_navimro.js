const { chromium } = require('playwright');

async function testNavimro() {
    let browser;
    try {
        browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();
        
        const keyword = 'A4 복사지 2500매';
        const url = `https://www.navimro.com/search/?q=${encodeURIComponent(keyword)}`;
        console.log("Navigating to:", url);
        await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
        const html = await page.content();
        require('fs').writeFileSync('navimro_dump.html', html);
        console.log("HTML saved to navimro_dump.html");
    } catch (e) {
        console.error(e);
    } finally {
        if (browser) await browser.close();
    }
}

testNavimro();
