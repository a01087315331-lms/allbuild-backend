require('dotenv').config();
async function run() {
    const keyword = 'A4 복사지 2500매';
    const clientId = process.env.NAVER_CLIENT_ID;
    const clientSecret = process.env.NAVER_CLIENT_SECRET;
    const url = `https://openapi.naver.com/v1/search/shop.json?query=${encodeURIComponent(keyword)}&display=100`;
    const response = await fetch(url, { headers: { 'X-Naver-Client-Id': clientId, 'X-Naver-Client-Secret': clientSecret } });
    const data = await response.json();
    if(data.items) {
        const malls = new Set(data.items.map(i => i.mallName));
        console.log("검색된 쇼핑몰 목록:", Array.from(malls));
        const coupangItems = data.items.filter(i => i.mallName.includes('쿠팡'));
        console.log("쿠팡 아이템들:", coupangItems.slice(0, 2));
    }
}
run();
