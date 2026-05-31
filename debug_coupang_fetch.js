async function run() {
    const keyword = 'A4 복사지 2500매';
    const response = await fetch(`https://www.coupang.com/np/search?q=${encodeURIComponent(keyword)}`, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            'Accept-Language': 'ko-KR,ko;q=0.9'
        }
    });
    const html = await response.text();
    if(html.includes('search-product')) {
        console.log("Coupang fetch 성공! 상품이 있습니다.");
    } else {
        console.log("Coupang fetch 차단됨 (또는 상품 없음). HTML 크기:", html.length);
        if (html.length < 2000) console.log(html);
    }
}
run();
