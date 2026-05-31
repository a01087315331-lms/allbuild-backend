require('dotenv').config();
async function run() {
    const keyword = 'A4 복사지 2500매';
    const clientId = process.env.NAVER_CLIENT_ID;
    const clientSecret = process.env.NAVER_CLIENT_SECRET;
    const url = `https://openapi.naver.com/v1/search/shop.json?query=${encodeURIComponent(keyword)}&display=2`;
    const response = await fetch(url, { headers: { 'X-Naver-Client-Id': clientId, 'X-Naver-Client-Secret': clientSecret } });
    const data = await response.json();
    console.log(JSON.stringify(data.items, null, 2));
}
run();
