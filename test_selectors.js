const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

async function run() {
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const keyword = 'A4 복사용지';
    const searchUrl = 'https://www.navimro.com/search/?q=' + encodeURIComponent(keyword);
    console.log("Navigating to:", searchUrl);
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(r => setTimeout(r, 3000));
    
    const html = await page.content();
    require('fs').writeFileSync('search_dump.html', html);

    const products = await page.$$eval('.prd-list-wrap .prd-item, .product-list .item, .prd-list .prd-item', els => {
        return els.map(e => {
            const titleEl = e.querySelector('.prd-name') || e.querySelector('.name');
            const priceEl = e.querySelector('.prd-price .num') || e.querySelector('.price');
            return {
                title: titleEl ? titleEl.innerText.trim() : null,
                price: priceEl ? priceEl.innerText.trim() : null
            };
        }).filter(p => p.title);
    });

    console.log('Search page items found:', products.length);
    console.log(products.slice(0, 3));
    await browser.close();
}
run();
