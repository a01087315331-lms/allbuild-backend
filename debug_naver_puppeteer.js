const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

async function run() {
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    const keyword = 'A4 복사지 2500매';
    await page.goto(`https://search.shopping.naver.com/search/all?query=${encodeURIComponent(keyword)}`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));
    
    const products = await page.$$eval('[class^="product_item__"]', els => {
        return els.slice(0, 5).map(e => {
            const titleEl = e.querySelector('[class^="product_title__"]');
            const priceEl = e.querySelector('[class^="price_num__"]');
            const deliveryEl = e.querySelector('[class^="price_delivery__"]');
            return {
                title: titleEl ? titleEl.innerText.trim() : null,
                price: priceEl ? priceEl.innerText : null,
                delivery: deliveryEl ? deliveryEl.innerText : '정보없음'
            };
        });
    });
    console.log("Naver Shopping 추출 결과:", products);
    await browser.close();
}
run();
