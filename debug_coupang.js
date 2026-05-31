const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
    let browser;
    try {
        browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();
        page.setDefaultNavigationTimeout(30000); // 30초 대기
        
        // 쿠팡 봇 차단 우회를 위한 기본 설정
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });

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
        
        if (products.length === 0) {
            const body = await page.content();
            fs.writeFileSync('coupang_debug.html', body);
            console.log("HTML 저장됨 (coupang_debug.html)");
        }
    } catch(e) {
        console.error(e);
    } finally {
        if (browser) await browser.close();
    }
})();
