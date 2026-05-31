// server/utils/calculator.js
// 상품 가격 및 배송일 계산 유틸리티

/**
 * 주어진 상품 가격과 쇼핑몰을 기반으로 공식 배송비 정책을 적용하여 부가세와 총합을 계산합니다.
 * @param {number|string} price 원가
 * @param {string} mallName 쇼핑몰 이름
 * @returns {object} { price, tax, shippingFee, totalPrice }
 */
function calculatePriceData(price, mallName = '') {
    let numPrice = typeof price === 'string' ? parseInt(price.replace(/[^0-9]/g, '')) : price;
    if (isNaN(numPrice)) numPrice = 0;

    let shippingFee = 3000; // 기본 배송비

    // 쇼핑몰별 정확한 공식 배송비 정책 적용
    if (mallName.includes('나비엠알오')) {
        shippingFee = numPrice >= 50000 ? 0 : 3000; // 5만원 이상 무료배송
    } else if (mallName.includes('쿠팡')) {
        shippingFee = numPrice >= 19800 ? 0 : 3000; // 로켓배송 기준 19,800원 이상 무료배송
    } else if (mallName.includes('11번가') || mallName.includes('G마켓') || mallName.includes('네이버')) {
        shippingFee = 3000; // 오픈마켓은 개별 판매자 정책 따름 (기본 3,000원 추산)
    }

    const tax = Math.round(numPrice * 0.1);
    const totalPrice = numPrice + tax + shippingFee;

    return {
        price: numPrice,
        tax: tax,
        shippingFee: shippingFee,
        totalPrice: totalPrice
    };
}

/**
 * 각 쇼핑몰 특성에 따라 예상 배송 소요일수(일)를 계산(또는 추정)합니다.
 * 실제 쇼핑몰 페이지에 명시되지 않은 경우 사용합니다.
 * @param {string} mallName 쇼핑몰 이름 (예: 쿠팡, 11번가)
 * @returns {number} 예상 배송 소요일 (예: 1, 2, 3)
 */
function estimateShippingDays(mallName) {
    const mall = mallName.toLowerCase();
    
    // 쿠팡(로켓배송 등)은 보통 다음날(1일) 도착
    if (mall.includes('쿠팡')) {
        return 1;
    }
    // 네이버 스마트스토어, 11번가 등은 평균 2~3일
    else if (mall.includes('네이버') || mall.includes('스마트스토어')) {
        return 2;
    }
    else if (mall.includes('11번가') || mall.includes('g마켓') || mall.includes('지마켓')) {
        return 2;
    }
    // 나비엠알오 등 전문 B2B몰은 2~4일
    else if (mall.includes('나비엠알오')) {
        return 3;
    }
    // 그 외 기본 3일
    return 3;
}

module.exports = {
    calculatePriceData,
    estimateShippingDays
};
