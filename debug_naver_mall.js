require('dotenv').config();

async function testNaverForMall(keyword) {
    const clientId = process.env.NAVER_CLIENT_ID;
    const clientSecret = process.env.NAVER_CLIENT_SECRET;
    const url = `https://openapi.naver.com/v1/search/shop.json?query=${encodeURIComponent(keyword)}&display=20`;
    try {
        const response = await fetch(url, { headers: { 'X-Naver-Client-Id': clientId, 'X-Naver-Client-Secret': clientSecret } });
        const data = await response.json();
        console.log(`[${keyword}] 결과:`);
        if (data.items) {
            data.items.forEach(i => console.log(` - ${i.mallName}: ${i.title.replace(/<[^>]*>?/gm, '')}`));
        } else {
            console.log("없음");
        }
    } catch(e) { console.error(e); }
}

testNaverForMall('네이버쇼핑 a4 복사지 2500매');
