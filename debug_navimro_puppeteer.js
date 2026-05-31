const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

async function testNavimro() {
    let browser;
    try {
        browser = await puppeteer.launch({ 
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080']
        });
        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        const keyword = 'A4 복사용지 2500매';
        console.log("메인 페이지 접속 중...");
        
        // 메인 페이지 먼저 접속
        await page.goto('https://www.navimro.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
        await new Promise(r => setTimeout(r, 1000));
        
        console.log("검색어 입력 중...");
        // 검색창 찾기 (id가 suggest_search 인 것으로 보임)
        await page.waitForSelector('#suggest_search');
        await page.type('#suggest_search', keyword, { delay: 100 });
        await page.keyboard.press('Enter');
        
        console.log("검색 결과 대기 중...");
        await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(e => console.log('네비게이션 타임아웃 무시'));
        await new Promise(r => setTimeout(r, 2000)); // 로딩 대기
        
        // 스크롤 로직
        await page.evaluate(async () => {
            await new Promise((resolve) => {
                let totalHeight = 0;
                let distance = 400;
                let timer = setInterval(() => {
                    let scrollHeight = document.body.scrollHeight;
                    window.scrollBy(0, distance);
                    totalHeight += distance;
                    if(totalHeight >= scrollHeight - window.innerHeight){
                        clearInterval(timer);
                        resolve();
                    }
                }, 150);
            });
        });
        
        const products = await page.$$eval('.prd-list-wrap .prd-item, .product-list .item, .prd-list .prd-item', els => {
            return els.slice(0, 10).map(e => {
                const titleEl = e.querySelector('.prd-name') || e.querySelector('.name');
                const priceEl = e.querySelector('.prd-price .num') || e.querySelector('.price');
                const linkEl = e.querySelector('a');
                return {
                    title: titleEl ? titleEl.innerText.trim() : null,
                    priceText: priceEl ? priceEl.innerText.trim() : null,
                    href: linkEl ? linkEl.href : null
                };
            }).filter(p => p.title && p.priceText);
        });

        console.log("나비엠알오 결과 갯수:", products.length);
        if (products.length > 0) {
            console.log(products.slice(0, 3));
        } else {
            console.log("결과가 없습니다. 스크린샷과 HTML을 저장합니다.");
            await page.screenshot({path: 'navimro_debug.png', fullPage: true});
            const html = await page.content();
            require('fs').writeFileSync('navimro_dump.html', html);
        }
    } catch(e) {
        console.error("에러:", e);
    } finally {
        if(browser) await browser.close();
    }
}

testNavimro();


