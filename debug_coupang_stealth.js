const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

(async () => {
    let browser;
    try {
        browser = await puppeteer.launch({ headless: 'new' });
        const page = await browser.newPage();
        await page.goto('https://www.coupang.com/np/search?component=&q=a4+%EB%B3%B5%EC%82%AC%EC%A7%80+2500%EB%A7%A4', { waitUntil: 'domcontentloaded' });
        
        const title = await page.title();
        console.log("페이지 제목:", title);
        
        const products = await page.$$eval('.search-product', els => {
            return els.slice(0, 3).map(e => {
                const name = e.querySelector('.name')?.innerText;
                const price = e.querySelector('.price-value')?.innerText;
                return { name, price };
            });
        });
        console.log("쿠팡 결과:", products);
    } catch(e) {
        console.error(e);
    } finally {
        if (browser) await browser.close();
    }
})();
