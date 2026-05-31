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
    
    const html = await page.$eval('.item', el => el.innerHTML);
    console.log(html);
    await browser.close();
}
run();
