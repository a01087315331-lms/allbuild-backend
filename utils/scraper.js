// server/utils/scraper.js
// 6대 쇼핑몰 (네이버, 쿠팡, 11번가, G마켓, 옥션, 나비MRO) 최저가 크롤러 모듈

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const { calculatePriceData, estimateShippingDays } = require('./calculator');
require('dotenv').config();

// 검색한 핵심 단어들과 쇼핑몰 상품명이 일치하는지 유연하게 판정하는 헬퍼 함수
function isTitleMatch(title, searchWords) {
    if (searchWords.length === 0) return true;
    const lowerTitle = title.toLowerCase();
    
    let matchCount = 0;
    for (const word of searchWords) {
        let altWord = word;
        if (word.includes('복사지')) altWord = '복사';
        else if (word.includes('매')) altWord = word.replace('매', '');
        
        // 검색어 혹은 변형 단어가 상품 제목에 포함되면 카운트 증가
        if (lowerTitle.includes(word) || lowerTitle.includes(altWord)) {
            matchCount++;
        }
    }
    
    // 검색어가 여러 개일 때, 단어의 절반 이상이 포함되어 있다면 유효한 상품으로 매칭 처리
    return matchCount >= Math.ceil(searchWords.length / 2);
}

// 네이버 쇼핑 검색 API를 호출해 특정 몰(네이버, 쿠팡, 11번가, G마켓, 옥션)의 데이터를 필터링하는 함수
async function fetchNaverMall(keyword, searchWords, targetMall) {
    const clientId = process.env.NAVER_CLIENT_ID;
    const clientSecret = process.env.NAVER_CLIENT_SECRET;
    
    // 네이버 쇼핑 OpenAPI 호출 (비교 데이터를 최대화하기 위해 최대치인 100개 노출 요청)
    const url = `https://openapi.naver.com/v1/search/shop.json?query=${encodeURIComponent(keyword)}&display=100`;
    
    try {
        const response = await fetch(url, {
            headers: { 
                'X-Naver-Client-Id': clientId, 
                'X-Naver-Client-Secret': clientSecret 
            }
        });
        const data = await response.json();
        if (!data.items) return [];

        let extracted = [];
        for (const item of data.items) {
            const title = item.title.replace(/<[^>]*>?/gm, ''); // HTML 태그 제거
            let matchMall = false;
            
            // 6대 쇼핑몰 조건 분기 (네이버 쇼핑 API 결과 내에서 각 쇼핑몰 구별)
            if (targetMall === '네이버') {
                matchMall = true;
            } else if (targetMall === '쿠팡' && item.mallName === '쿠팡') {
                matchMall = true;
            } else if (targetMall === '11번가' && item.mallName === '11번가') {
                matchMall = true;
            } else if (targetMall === 'G마켓' && item.mallName === 'G마켓') {
                matchMall = true;
            } else if (targetMall === '옥션' && item.mallName === '옥션') { // [신규] 6대 쇼핑몰 '옥션' 추가
                matchMall = true;
            }

            // 쇼핑몰 조건 및 상품명 매칭 검증
            if (!matchMall || !isTitleMatch(title, searchWords)) continue;

            const shippingDays = targetMall === '쿠팡' ? 1 : 2; // 쿠팡은 로켓배송 기준 1일, 나머지는 평균 2일 배송
            const priceInfo = calculatePriceData(parseInt(item.lprice, 10), targetMall);

            extracted.push({
                mall_name: targetMall,
                product_name: title,
                price: priceInfo.price,
                tax: priceInfo.tax,
                shipping_fee: priceInfo.shippingFee,
                total_price: priceInfo.totalPrice,
                shipping_days: shippingDays,
                product_url: item.link
            });
        }
        
        // 총 구매가 기준 오름차순(최저가 순) 정렬
        extracted.sort((a, b) => a.total_price - b.total_price);
        
        // 최저가 상품 최대 2개만 반환하도록 슬라이스 처리 (요구사항: 각 몰별 2개씩)
        return extracted.slice(0, 2);
    } catch(e) {
        console.error(`[${targetMall} 에러]`, e);
        return [];
    }
}

// Puppeteer 페이지의 끝까지 스크롤하여 모든 동적 콘텐츠를 렌더링시키는 함수
async function autoScroll(page) {
    await page.evaluate(async () => {
        await new Promise((resolve) => {
            let totalHeight = 0;
            let distance = 500;
            let timer = setInterval(() => {
                let scrollHeight = document.body.scrollHeight;
                window.scrollBy(0, distance);
                totalHeight += distance;
                if(totalHeight >= scrollHeight - window.innerHeight || totalHeight > 10000){
                    clearInterval(timer);
                    resolve();
                }
            }, 150);
        });
    });
}

// 나비MRO 전용 Puppeteer 웹 스크래퍼
async function scrapeNavimro(page, keyword, searchWords) {
    try {
        console.log(`[나비엠알오 시작] 키워드: ${keyword}`);
        const searchUrl = 'https://www.navimro.com/s/?q=' + encodeURIComponent(keyword);
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await new Promise(r => setTimeout(r, 2000));
        await autoScroll(page);

        // 나비MRO 상품 목록 아이템(.item) 셀렉터 파싱
        const products = await page.$$eval('.item', els => {
            return els.slice(0, 40).map(e => {
                const titleEl = e.querySelector('.item__title');
                const priceEl = e.querySelector('.sale__price strong');
                return {
                    title: titleEl ? titleEl.innerText.trim() : '',
                    priceText: priceEl ? priceEl.innerText.replace(/,/g, '') : '0',
                    href: titleEl ? titleEl.href : ''
                };
            }).filter(p => p.title && parseInt(p.priceText) > 0);
        });

        console.log(`[나비엠알오 결과] 검색 페이지에서 ${products.length}개 상품 발견.`);

        let extracted = [];
        for (const item of products) {
            if (!isTitleMatch(item.title, searchWords)) continue;
            const priceInfo = calculatePriceData(parseInt(item.priceText, 10), '나비엠알오');
            extracted.push({
                mall_name: '나비엠알오',
                product_name: item.title,
                price: priceInfo.price,
                tax: priceInfo.tax,
                shipping_fee: priceInfo.shippingFee,
                total_price: priceInfo.totalPrice,
                shipping_days: 3, 
                product_url: item.href
            });
        }
        
        // 최저가 순 정렬
        extracted.sort((a, b) => a.total_price - b.total_price);
        console.log(`[나비엠알오 매칭] 필터 통과 상품 ${extracted.length}개.`);
        
        // 각 몰별 최저가 상품 2개만 반환하도록 조절
        return extracted.slice(0, 2);
    } catch (e) {
        console.error('[나비엠알오 에러]', e);
        return [];
    }
}

// 검색 결과가 존재하지 않을 때 UI 안착을 돕기 위해 생성해주는 더미 데이터 빌더
function createDummyProduct(keyword, mall) {
    return {
        mall_name: mall,
        product_name: `[결과없음] 해당 쇼핑몰에 '${keyword}' 관련 상품이 존재하지 않습니다.`,
        price: 0,
        tax: 0,
        shipping_fee: 0,
        total_price: 0,
        shipping_days: 0,
        product_url: '#'
    };
}

// 메인 비즈니스 크롤링 오케스트레이터
async function scrapeProducts(keyword) {
    console.log(`[복합 6대 쇼핑몰 스크래퍼] '${keyword}' 검색 시작...`);
    const searchWords = keyword.toLowerCase().split(' ').filter(word => word.trim().length > 0);
    
    let browser;
    try {
        browser = await puppeteer.launch({ 
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080']
        });
        const pageNavimro = await browser.newPage();
        await pageNavimro.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // 6대 쇼핑몰 병렬 수집 (네이버 API 5개 + 나비MRO Puppeteer 1개)
        const [naver, coupang, st11, gmarket, auction, navimro] = await Promise.all([
            fetchNaverMall(keyword, searchWords, '네이버'),
            fetchNaverMall(keyword, searchWords, '쿠팡'),
            fetchNaverMall(keyword, searchWords, '11번가'),
            fetchNaverMall(keyword, searchWords, 'G마켓'),
            fetchNaverMall(keyword, searchWords, '옥션'),       // [신규] 옥션 추가
            scrapeNavimro(pageNavimro, keyword, searchWords) // MRO 전용 쇼핑몰
        ]);

        // 검색된 결과 개수가 2개 미만인 경우 더미 상품으로 채워 각 몰별 딱 2개씩 고정 반환
        const formatResults = (items, mall) => {
            const result = [...items].slice(0, 2);
            while (result.length < 2) {
                result.push(createDummyProduct(keyword, mall));
            }
            return result;
        };

        const finalResults = [
            ...formatResults(naver, '네이버'),
            ...formatResults(coupang, '쿠팡'),
            ...formatResults(st11, '11번가'),
            ...formatResults(gmarket, 'G마켓'),
            ...formatResults(auction, '옥션'),       // [신규] 옥션 추가
            ...formatResults(navimro, '나비엠알오')
        ];

        return finalResults;
    } catch(e) {
        console.error("전체 스크래핑 에러:", e);
        return [];
    } finally {
        if(browser) await browser.close();
    }
}

module.exports = {
    scrapeProducts
};
