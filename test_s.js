const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

async function run() {
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const keyword = 'A4 복사용지';
    const searchUrl = 'https://www.navimro.com/s/?q=' + encodeURIComponent(keyword);
    console.log('Navigating to:', searchUrl);
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));
    
    const products = await page.$$eval('.item', els => els.map(e => {
        const titleEl = e.querySelector('.item__title');
        const priceEl = e.querySelector('.sale__price strong');
        return {
            title: titleEl ? titleEl.innerText.trim() : null,
            price: priceEl ? priceEl.innerText.trim() : null,
            href: titleEl ? titleEl.href : null
        };
    }).filter(p => p.title));
    
    console.log('Found:', products.length);
    console.log(products.slice(0, 5));
    await browser.close();
}
run();
