const https = require('https');

async function fetchCoupang() {
    try {
        const response = await fetch('https://www.coupang.com/np/search?component=&q=a4+%EB%B3%B5%EC%82%AC%EC%A7%80+2500%EB%A7%A4', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
                'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
                'Sec-Ch-Ua-Mobile': '?0',
                'Sec-Ch-Ua-Platform': '"Windows"',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1',
                'Upgrade-Insecure-Requests': '1'
            }
        });
        const html = await response.text();
        console.log("상태 코드:", response.status);
        console.log("제목:", html.match(/<title[^>]*>([^<]+)<\/title>/)?.[1]);
    } catch(e) {
        console.error(e);
    }
}
fetchCoupang();
