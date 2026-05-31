const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

async function run() {
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const keyword = 'A4 복사용지 2500매';
    await page.goto('https://www.navimro.com/', { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 1000));
    await page.type('#suggest_search', keyword);
    await page.keyboard.press('Enter');
    await new Promise(r => setTimeout(r, 3000));
    
    const title = await page.title();
    console.log("나비엠알오 타이틀:", title);
    
    const products = await page.$$eval('.prd-item, .item', els => {
        return els.slice(0, 5).map(e => {
            return { text: e.innerText.replace(/\n/g, ' ').substring(0, 50) };
        });
    });
    console.log("추출된 엘리먼트 텍스트:", products);
    await browser.close();
}
run();
