const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const { calculatePriceData } = require('./utils/calculator');

function isTitleMatch(title, searchWords) {
    if (searchWords.length === 0) return true;
    const lowerTitle = title.toLowerCase();
    let matchCount = 0;
    for (const word of searchWords) {
        let altWord = word;
        if (word.includes('복사지')) altWord = '복사';
        else if (word.includes('매')) altWord = word.replace('매', '');
        
        if (lowerTitle.includes(word) || lowerTitle.includes(altWord)) {
            matchCount++;
        }
    }
    return matchCount >= Math.ceil(searchWords.length / 2);
}

async function autoScroll(page) {
    await page.evaluate(async () => {
        await new Promise((resolve) => {
            let totalHeight = 0;
            let distance = 500;
            let timer = setInterval(() => {
                let scrollHeight = document.body.scrollHeight;
                window.scrollBy(0, distance);
                totalHeight += distance;
                if(totalHeight >= scrollHeight - window.innerHeight || totalHeight > 10000){
                    clearInterval(timer);
                    resolve();
                }
            }, 150);
        });
    });
}

async function scrapeNavimro(page, keyword, searchWords) {
    try {
        console.log("Goto navimro search page directly");
        const searchUrl = 'https://www.navimro.com/search/?q=' + encodeURIComponent(keyword);
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await new Promise(r => setTimeout(r, 2000));
        console.log("Scrolling");
        await autoScroll(page);

        console.log("Evaluating items");
        const products = await page.$$eval('.item', els => {
            return els.slice(0, 40).map(e => {
                const titleEl = e.querySelector('.item__title');
                const priceEl = e.querySelector('.sale__price strong');
                return {
                    title: titleEl ? titleEl.innerText.trim() : '',
                    priceText: priceEl ? priceEl.innerText.replace(/,/g, '') : '0',
                    href: titleEl ? titleEl.href : ''
                };
            }).filter(p => p.title && parseInt(p.priceText) > 0);
        });

        console.log("Found products raw length:", products.length);

        let extracted = [];
        for (const item of products) {
            if (!isTitleMatch(item.title, searchWords)) {
                console.log("Filtered out:", item.title);
                continue;
            }
            const priceInfo = calculatePriceData(parseInt(item.priceText, 10), '나비엠알오');
            extracted.push({
                mall_name: '나비엠알오',
                product_name: item.title,
                price: priceInfo.price,
                tax: priceInfo.tax,
                shipping_fee: priceInfo.shippingFee,
                total_price: priceInfo.totalPrice,
                shipping_days: 2,
                product_url: item.href
            });
        }
        extracted.sort((a, b) => a.total_price - b.total_price);
        return extracted.slice(0, 3);
    } catch (e) {
        console.error('[나비엠알오 에러]', e);
        return [];
    }
}

async function run() {
    const browser = await puppeteer.launch({ 
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080']
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    const keyword = 'A4 복사지 2500매';
    const res = await scrapeNavimro(page, keyword, keyword.split(' '));
    console.log("FINAL:", res);
    await browser.close();
}
run();
