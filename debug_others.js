const { chromium } = require('playwright');

(async () => {
    let browser;
    try {
        browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();
        
        // 11번가 테스트
        await page.goto('https://search.11st.co.kr/pc/total-search?kwd=a4+%EB%B3%B5%EC%82%AC%EC%A7%80+2500%EB%A7%A4', { waitUntil: 'domcontentloaded' });
        const st11Products = await page.$$eval('.c-search-list__item', els => {
            return els.slice(0, 3).map(e => {
                const name = e.querySelector('.c-card-item__info-title')?.innerText || '';
                const price = e.querySelector('.c-card-item__price-value')?.innerText || '';
                return { name, price };
            });
        });
        console.log("11번가 결과:", st11Products);
        
        // G마켓 테스트
        await page.goto('https://browse.gmarket.co.kr/search?keyword=a4+%eb%b3%b5%ec%82%ac%ec%a7%80+2500%eb%a7%a4', { waitUntil: 'domcontentloaded' });
        const gmarketProducts = await page.$$eval('.box__item-container', els => {
            return els.slice(0, 3).map(e => {
                const name = e.querySelector('.text__item')?.innerText || '';
                const price = e.querySelector('.box__price-seller strong')?.innerText || '';
                return { name, price };
            });
        });
        console.log("G마켓 결과:", gmarketProducts);
        
    } catch(e) {
        console.error(e);
    } finally {
        if (browser) await browser.close();
    }
})();
