const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

async function run() {
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const keyword = 'A4 복사용지 2500매';
    await page.goto(`https://www.coupang.com/np/search?q=${encodeURIComponent(keyword)}`, { waitUntil: 'domcontentloaded' });
    
    const products = await page.$$eval('.search-product', els => {
        return els.slice(0, 5).map(e => {
            const titleEl = e.querySelector('.name');
            const priceEl = e.querySelector('.price-value');
            return {
                title: titleEl ? titleEl.innerText.trim() : null,
                price: priceEl ? priceEl.innerText : null
            };
        });
    });
    console.log("추출된 상품들:", products);
    await browser.close();
}
run();
