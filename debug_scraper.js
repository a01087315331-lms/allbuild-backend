const { scrapeProducts } = require('./utils/scraper');

async function run() {
    const keyword = 'A4 복사지 2500매';
    console.log(`검색어: ${keyword}`);
    const results = await scrapeProducts(keyword);
    console.log("전체 크롤링 결과 갯수:", results.length);
    console.log(JSON.stringify(results, null, 2));
}

run();
