require('dotenv').config();

async function checkMallNames() {
    const keyword = 'a4 복사지 2500매';
    const clientId = process.env.NAVER_CLIENT_ID;
    const clientSecret = process.env.NAVER_CLIENT_SECRET;
    const url = `https://openapi.naver.com/v1/search/shop.json?query=${encodeURIComponent(keyword)}&display=100`;
    try {
        const response = await fetch(url, { headers: { 'X-Naver-Client-Id': clientId, 'X-Naver-Client-Secret': clientSecret } });
        const data = await response.json();
        
        const malls = new Set();
        if (data.items) {
            data.items.forEach(item => {
                malls.add(item.mallName);
            });
        }
        console.log("발견된 쇼핑몰 목록:");
        console.log(Array.from(malls).join(', '));
    } catch(e) { console.error(e); }
}

checkMallNames();
