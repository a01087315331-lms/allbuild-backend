async function run() {
    const url = "https://search.shopping.naver.com/catalog/51929353762";
    const response = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
        }
    });
    const html = await response.text();
    const fs = require('fs');
    fs.writeFileSync('naver_catalog.html', html);
    console.log("HTML 저장 완료. 크기:", html.length);
}
run();
