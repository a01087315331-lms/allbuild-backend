// server/utils/urlParser.js
// 쇼핑몰 추적 우회 링크를 다이렉트(원본) 링크로 변환해주는 유틸리티

/**
 * 네이버 API 등이 제공하는 가격비교 추적용 URL에서 진짜 상품 번호를 추출하여
 * 차단 검사가 없는 각 쇼핑몰의 원본 다이렉트 URL로 변환합니다.
 * @param {string} originalUrl 원래의 URL
 * @param {string} mallName 쇼핑몰 이름 (예: '쿠팡', '11번가')
 * @returns {string} 안전한 다이렉트 URL (변환 불가능하면 원본 반환)
 */
function parseDirectUrl(originalUrl, mallName) {
    if (!originalUrl) return '';

    try {
        const urlObj = new URL(originalUrl);
        const searchParams = urlObj.searchParams;

        if (mallName === '쿠팡') {
            // 쿠팡 패턴: link.coupang.com/... ?pageKey=...&itemId=...&vendorItemId=...
            const pageKey = searchParams.get('pageKey');
            const itemId = searchParams.get('itemId');
            const vendorItemId = searchParams.get('vendorItemId');
            
            if (pageKey) {
                let directUrl = `https://www.coupang.com/vp/products/${pageKey}`;
                const params = [];
                if (itemId) params.push(`itemId=${itemId}`);
                if (vendorItemId) params.push(`vendorItemId=${vendorItemId}`);
                
                if (params.length > 0) {
                    directUrl += `?${params.join('&')}`;
                }
                return directUrl;
            }
        } 
        else if (mallName === '11번가') {
            // 11번가 패턴: 11st.co.kr/connect/Gateway.tmall?method=Xsite&prdNo=...
            const prdNo = searchParams.get('prdNo');
            if (prdNo) {
                return `https://www.11st.co.kr/products/${prdNo}`;
            }
        } 
        else if (mallName === 'G마켓') {
            // G마켓 패턴: link.gmarket.co.kr/gate/pcs?item-no=...
            const itemNo = searchParams.get('item-no') || searchParams.get('goodscode');
            if (itemNo) {
                return `https://item.gmarket.co.kr/Item?goodscode=${itemNo}`;
            }
        }
        
        // 그 외 쇼핑몰(네이버 등)이거나 매칭되는 파라미터가 없으면 원본을 그대로 반환
        return originalUrl;
    } catch (e) {
        // URL 파싱 에러 발생 시 프로그램이 멈추지 않도록 안전하게 원본 반환
        console.error('[URL 파싱 에러]', e.message);
        return originalUrl;
    }
}

module.exports = {
    parseDirectUrl
};
