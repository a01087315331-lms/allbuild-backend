const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
    let browser;
    try {
        browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();
        
        await page.goto('https://search.11st.co.kr/pc/total-search?kwd=a4+%EB%B3%B5%EC%82%AC%EC%A7%80+2500%EB%A7%A4', { waitUntil: 'domcontentloaded' });
        const html11 = await page.content();
        fs.writeFileSync('11st_debug.html', html11);
        
        await page.goto('https://browse.gmarket.co.kr/search?keyword=a4+%eb%b3%b5%ec%82%ac%ec%a7%80+2500%eb%a7%a4', { waitUntil: 'domcontentloaded' });
        const htmlGm = await page.content();
        fs.writeFileSync('gmarket_debug.html', htmlGm);
        
        console.log("HTML 저장 완료");
    } catch(e) {
        console.error(e);
    } finally {
        if (browser) await browser.close();
    }
})();
