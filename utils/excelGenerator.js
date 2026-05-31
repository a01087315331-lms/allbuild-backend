const XLSX = require('xlsx');

/**
 * 상품 데이터 배열을 엑셀 워크북으로 변환하여 Buffer 형태로 반환합니다.
 */
function generateExcelBuffer(products) {
    const excelData = products.map((item, index) => ({
        'No.': index + 1,
        '쇼핑몰': item.mall_name,
        '상품명': item.product_name,
        '공급가액(원)': { t: 'n', v: Number(item.price || 0), z: '#,##0' },
        '부가세(원)': { t: 'n', v: Number(item.tax || 0), z: '#,##0' },
        '배송비(원)': { t: 'n', v: Number(item.shipping_fee || 0), z: '#,##0' },
        '총 구매가(원)': { t: 'n', v: Number(item.total_price || 0), z: '#,##0' },
        '예상 배송일(일)': Number(item.shipping_days || 0),
        '구매 링크': item.product_url,
        '발주 선택': '' 
    }));

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const wscols = [
        { wch: 5 }, { wch: 15 }, { wch: 50 }, { wch: 15 }, { wch: 15 },
        { wch: 15 }, { wch: 15 }, { wch: 40 }, { wch: 10 }
    ];
    worksheet['!cols'] = wscols;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '가격비교 결과');

    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

/**
 * 다차원 결산 리포트 생성 (회사 표준 결재보고서 양식 및 다중 시트 통합 구조)
 */
function generateSettlementExcel(orders, businessInfo = {}, searchResults = []) {
    const workbook = XLSX.utils.book_new();

    // 날짜 포맷 함수 (YYYY-MM-DD)
    const formatDate = (dateStr) => {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return '';
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    // ----------------------------------------------------
    // 1. [종합 결산 보고서] 시트 생성 (대시보드 & 결재선)
    // ----------------------------------------------------
    const todayStr = formatDate(new Date());
    const dataEndRow = 6 + Math.max(1, orders.length); // 상세시트 데이터 종료 행 계산
    
    // AOA(Array of Arrays) 방식으로 구조화된 셀 배치 구성
    const dashboardAOA = [
        ['', '', '', '', '', '', '', '결재', '담당', '검토', '승인'], // Row 1 (index 0)
        ['', '', '', '', '', '', '', '', '', '', ''],             // Row 2 (index 1)
        ['', '', '', '', '', '', '', '', '', '', ''],             // Row 3 (index 2)
        ['', '', '', '', '', '', '', '', '', '', ''],             // Row 4 (index 3)
        ['올빌드(Allbuild) 통합 결산 및 발주 보고서', '', '', '', '', '', ''], // Row 5 (index 4)
        [], // Row 6
        ['[ 사업자 정보 ]'], // Row 7
        ['상 호 명', businessInfo.name || '미등록', '사업자번호', businessInfo.number || '미등록'], // Row 8
        ['출력일자', todayStr, '', ''], // Row 9
        [], // Row 10
        ['Ⅰ. 통합 재무 결산 요약 (Summary)'], // Row 11
        ['구분', '금액 (원)', '비고', ''], // Row 12
        ['총 매입 건수', orders.length + ' 건', '확정 발주 완료 기준'], // Row 13
        ['총 매입금액 (공급가)', { t: 'n', f: `SUM('발주 완료 상세 내역'!E7:E${dataEndRow})`, v: 0, z: '#,##0' }, '상세 발주 완료 데이터 연동'], // Row 14
        ['매입 부가세 합계', { t: 'n', f: `SUM('발주 완료 상세 내역'!F7:F${dataEndRow})`, v: 0, z: '#,##0' }, '매입 기준 10% 부가세'], // Row 15
        ['총 매출금액 (판매가)', { t: 'n', f: `SUM('발주 완료 상세 내역'!I7:I${dataEndRow})`, v: 0, z: '#,##0' }, '판매 단가 기준 매출 총액'], // Row 16
        ['예상 매출 부가세', { t: 'n', f: 'B16*0.1', v: 0, z: '#,##0' }, '매출액 기준 10% 자동 추산'], // Row 17
        ['예상 납부 부가세', { t: 'n', f: 'B17-B15', v: 0, z: '#,##0' }, '납부할 부가세액 (매출세액 - 매입세액)'], // Row 18
        ['예상 최종 순수익 (마진)', { t: 'n', f: `B16-B14-B15-SUM('발주 완료 상세 내역'!G7:G${dataEndRow})`, v: 0, z: '#,##0' }, '순매출 - 매입공급가 - 매입부가세 - 배송비'], // Row 19
        [], // Row 20
        [], // Row 21
        ['Ⅱ. 일자별 매출 및 매입 결산 요약 (Daily Ledger)'], // Row 22
        [
            '발주일자', 
            '매출 공급가액(원)', 
            '매출 부가세(원)', 
            '매출 배송비(원)', 
            '매출 합계(원)', 
            '매입 공급가액(원)', 
            '매입 부가세(원)', 
            '매입 배송비(원)', 
            '매입 합계(원)', 
            '순수익 (마진)', 
            '비고'
        ] // Row 23 (index 22)
    ];

    // 고유 발주일자 추출 및 내림차순 정렬
    const uniqueDates = Array.from(
        new Set(orders.map(item => formatDate(item.order_date)).filter(d => d !== ''))
    ).sort((a, b) => new Date(b) - new Date(a));

    // 각 일자별 동적 SUMIF 수식 삽입
    uniqueDates.forEach((dateStr, index) => {
        const excelRowIndex = 24 + index; // Row 24부터 첫 번째 일자 데이터 시작
        dashboardAOA.push([
            dateStr, // Column A: 일자
            { t: 'n', f: `SUMIF('발주 완료 상세 내역'!B7:B${dataEndRow}, "${dateStr}", '발주 완료 상세 내역'!I7:I${dataEndRow})`, v: 0, z: '#,##0' }, // Column B: 매출 공급가액 (상세시트 판매금액 I열)
            { t: 'n', f: `B${excelRowIndex}*0.1`, v: 0, z: '#,##0' }, // Column C: 매출 부가세 (10%)
            { t: 'n', v: 0, z: '#,##0' }, // Column D: 매출 배송비 (판매 배송비는 0원으로 가정)
            { t: 'n', f: `B${excelRowIndex}+C${excelRowIndex}+D${excelRowIndex}`, v: 0, z: '#,##0' }, // Column E: 매출 합계
            { t: 'n', f: `SUMIF('발주 완료 상세 내역'!B7:B${dataEndRow}, "${dateStr}", '발주 완료 상세 내역'!E7:E${dataEndRow})`, v: 0, z: '#,##0' }, // Column F: 매입 공급가액 (상세시트 공급가 E열)
            { t: 'n', f: `SUMIF('발주 완료 상세 내역'!B7:B${dataEndRow}, "${dateStr}", '발주 완료 상세 내역'!F7:F${dataEndRow})`, v: 0, z: '#,##0' }, // Column G: 매입 부가세 (상세시트 부가세 F열)
            { t: 'n', f: `SUMIF('발주 완료 상세 내역'!B7:B${dataEndRow}, "${dateStr}", '발주 완료 상세 내역'!G7:G${dataEndRow})`, v: 0, z: '#,##0' }, // Column H: 매입 배송비 (상세시트 배송비 G열)
            { t: 'n', f: `F${excelRowIndex}+G${excelRowIndex}+H${excelRowIndex}`, v: 0, z: '#,##0' }, // Column I: 매입 합계
            { t: 'n', f: `E${excelRowIndex}-I${excelRowIndex}`, v: 0, z: '#,##0' }, // Column J: 순수익(마진)
            '발주 상품 연동 완료' // Column K: 비고
        ]);
    });

    if (uniqueDates.length === 0) {
        dashboardAOA.push(['결산할 일자별 발주 내역이 없습니다.', '', '', '', '', '', '', '', '', '', '']);
    }

    const wsDashboard = XLSX.utils.aoa_to_sheet(dashboardAOA);

    // 셀 병합(!merges) 설정 (0-indexed)
    wsDashboard['!merges'] = [
        // 결재 텍스트 병합 (H1:H4) -> col 7, row 0 to 3
        { s: { r: 0, c: 7 }, e: { r: 3, c: 7 } },
        // 제목 병합 (A5:G5) -> col 0 to 6, row 4
        { s: { r: 4, c: 0 }, e: { r: 4, c: 6 } }
    ];

    // 열 너비 설정
    wsDashboard['!cols'] = [
        { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 },
        { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 25 }
    ];

    XLSX.utils.book_append_sheet(workbook, wsDashboard, '종합 결산 보고서');

    // ----------------------------------------------------
    // 2. [발주 완료 상세 내역] 시트 생성 (상단 발주처 정보 삽입)
    // ----------------------------------------------------
    const detailAOA = [
        ['▣ 상세 발주 완료 내역 (DB 기록 기준)'], // Row 1 (index 0)
        ['[ 발주처 정보 ]'],                        // Row 2 (index 1)
        ['상 호 명', businessInfo.name || '미등록', '사업자등록번호', businessInfo.number || '미등록'], // Row 3 (index 2)
        ['주    소', businessInfo.address || '미등록', '전화번호', businessInfo.phone || '미등록'],       // Row 4 (index 3)
        [], // Row 5 (index 4) - 빈 구획
        ['순번', '발주일자', '쇼핑몰', '상품명', '매입공급가(원)', '매입부가세(원)', '배송비(원)', '매입합계(원)', '판매금액(매출)', '순이익(마진)', '배송일(일)'] // Row 6 (index 5)
    ];

    orders.forEach((item, index) => {
        const rowIndex = 7 + index; // Excel 행 번호 (1-based, Row 7부터 데이터 시작!)
        detailAOA.push([
            index + 1,
            formatDate(item.order_date),
            item.mall_name,
            item.product_name,
            { t: 'n', v: Number(item.price || 0), z: '#,##0' },
            { t: 'n', v: Number(item.tax || 0), z: '#,##0' },
            { t: 'n', v: Number(item.shipping_fee || 0), z: '#,##0' },
            { t: 'n', f: `E${rowIndex}+F${rowIndex}+G${rowIndex}`, v: 0, z: '#,##0' }, // 매입합계 = 공급가 + 부가세 + 배송비
            { t: 'n', v: Number(item.revenue || 0), z: '#,##0' },
            { t: 'n', f: `I${rowIndex}-H${rowIndex}`, v: 0, z: '#,##0' }, // 순이익 = 매출액 - 매입합계
            Number(item.shipping_days || 0)
        ]);
    });

    // 상세 내역 하단에 합계(SUM) 공식 행 추가 (순환참조 버그 완벽 수정!)
    if (orders.length > 0) {
        detailAOA.push([
            '합계', '', '', '',
            { t: 'n', f: `SUM(E7:E${dataEndRow})`, v: 0, z: '#,##0' },
            { t: 'n', f: `SUM(F7:F${dataEndRow})`, v: 0, z: '#,##0' },
            { t: 'n', f: `SUM(G7:G${dataEndRow})`, v: 0, z: '#,##0' },
            { t: 'n', f: `SUM(H7:H${dataEndRow})`, v: 0, z: '#,##0' },
            { t: 'n', f: `SUM(I7:I${dataEndRow})`, v: 0, z: '#,##0' },
            { t: 'n', f: `SUM(J7:J${dataEndRow})`, v: 0, z: '#,##0' },
            ''
        ]);
    } else {
        detailAOA.push(['확정 발주 내역이 아직 없습니다.', '', '', '', '', '', '', '', '', '', '']);
    }

    const wsDetail = XLSX.utils.aoa_to_sheet(detailAOA);
    wsDetail['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 10 } } // 타이틀 병합
    ];
    wsDetail['!cols'] = [
        { wch: 6 }, { wch: 14 }, { wch: 14 }, { wch: 45 }, { wch: 16 },
        { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 12 }
    ];

    XLSX.utils.book_append_sheet(workbook, wsDetail, '발주 완료 상세 내역');

    // ----------------------------------------------------
    // 3. [최저가 비교 내역] 시트 생성 (실시간 검색 결과 연동)
    // ----------------------------------------------------
    const searchAOA = [
        ['▣ 실시간 최저가 검색 및 가격 비교 내역'], // Row 1
        [], // Row 2
        ['순번', '검색 키워드', '쇼핑몰', '상품명', '공급가액(원)', '부가세(원)', '배송비(원)', '합계(원)', '배송일(일)', '구매링크'] // Row 3
    ];

    let searchCount = 0;
    if (searchResults && Array.isArray(searchResults)) {
        searchResults.forEach(group => {
            if (group.items && Array.isArray(group.items)) {
                group.items.forEach(item => {
                    searchCount++;
                    const rowIndex = 3 + searchCount; // Row 4부터 시작
                    searchAOA.push([
                        searchCount,
                        group.keyword,
                        item.mall_name,
                        item.product_name,
                        { t: 'n', v: Number(item.price || 0), z: '#,##0' },
                        { t: 'n', v: Number(item.tax || 0), z: '#,##0' },
                        { t: 'n', v: Number(item.shipping_fee || 0), z: '#,##0' },
                        { t: 'n', f: `E${rowIndex}+F${rowIndex}+G${rowIndex}`, v: 0, z: '#,##0' },
                        Number(item.shipping_days || 0),
                        item.product_url || '#'
                    ]);
                });
            }
        });
    }

    if (searchCount === 0) {
        searchAOA.push(['현재 로드된 최저가 검색 결과가 없습니다. 메인 페이지에서 검색을 먼저 수행해 주세요.', '', '', '', '', '', '', '', '', '']);
    }

    const wsSearch = XLSX.utils.aoa_to_sheet(searchAOA);
    wsSearch['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 9 } } // 타이틀 병합
    ];
    wsSearch['!cols'] = [
        { wch: 6 }, { wch: 20 }, { wch: 14 }, { wch: 45 }, { wch: 15 },
        { wch: 15 }, { wch: 12 }, { wch: 16 }, { wch: 12 }, { wch: 45 }
    ];

    XLSX.utils.book_append_sheet(workbook, wsSearch, '최저가 비교 내역');

    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = {
    generateExcelBuffer,
    generateSettlementExcel
};
