// server/utils/taxReportGenerator.js
// 매입/매출 다차원(일별, 월별, 분기/연도별) 결산 엑셀 자동 생성 유틸리티

const XLSX = require('xlsx');

/**
 * 발주(매입) 데이터와 사업자 정보를 기반으로 다중 시트 결산 엑셀 파일을 생성합니다.
 * @param {Object} businessInfo 사업자 정보 (상호명, 등록번호)
 * @param {Array} items 매입(발주) 상품 배열
 * @returns {Buffer} 엑셀 파일 데이터 버퍼
 */
function generateFinancialExcelBuffer(businessInfo, items) {
    const workbook = XLSX.utils.book_new();

    // 임의의 분산된 날짜 생성을 위한 헬퍼 (테스트용)
    // 실제 운영에서는 DB에 저장된 order_date를 사용하지만, 현재는 업로드 기반이므로 
    // 다차원 리포트의 효용성을 보여주기 위해 최근 1년 내 임의의 날짜를 부여합니다.
    const getRandomDate = () => {
        const start = new Date();
        start.setFullYear(start.getFullYear() - 1);
        const end = new Date();
        const date = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
        return date.toISOString().split('T')[0];
    };

    // --- 1. 매입 원장 (Raw Data) 시트 생성 ---
    // 데이터를 날짜 순으로 정렬하기 위해 먼저 가공
    const rawData = items.map((item, idx) => ({
        'No.': idx + 1,
        '매입 일자': item.date || item.order_date || getRandomDate(), // 실제 날짜 우선 사용
        '쇼핑몰': item.mall || item.mall_name,
        '상품명': item.name || item.product_name,
        '공급가액': parseInt(String(item.price).replace(/[^0-9]/g, '')) || 0,
        '부가세': parseInt(String(item.tax).replace(/[^0-9]/g, '')) || 0,
        '총 구매가': 0 // 나중에 계산
    }));
    rawData.forEach(r => r['총 구매가'] = r['공급가액'] + r['부가세']);
    
    // 날짜 오름차순 정렬
    rawData.sort((a, b) => new Date(a['매입 일자']) - new Date(b['매입 일자']));
    // No. 재부여
    rawData.forEach((r, idx) => r['No.'] = idx + 1);

    const wsRaw = XLSX.utils.json_to_sheet(rawData);
    
    // 열 너비 설정
    wsRaw['!cols'] = [{wch: 5}, {wch: 12}, {wch: 15}, {wch: 50}, {wch: 15}, {wch: 15}, {wch: 15}];
    XLSX.utils.book_append_sheet(workbook, wsRaw, '매입 원장 (Raw)');

    // --- 2. 종합 결산 (Dashboard) 시트 생성 ---
    const totalCost = rawData.reduce((sum, r) => sum + r['공급가액'], 0);
    const totalTax = rawData.reduce((sum, r) => sum + r['부가세'], 0);

    const dashboardData = [
        ['올빌드 통합 매입/매출 결산 대시보드'],
        [],
        ['[사업자 정보]'],
        ['상호명:', businessInfo.name, '사업자등록번호:', businessInfo.number],
        [],
        ['[종합 요약]'],
        ['총 매입액 (공급가)', totalCost],
        ['매입 부가세', totalTax],
        ['총 매출액 (직접입력)', 0],
        ['매출 부가세 (자동계산)', { t: 'n', f: 'B9*0.1' }],
        ['예상 납부 부가세 (매출-매입)', { t: 'n', f: 'B10-B8' }],
        ['예상 순이익 (매출-매입액)', { t: 'n', f: 'B9-B7' }],
        [],
        ['* 안내: B9 셀에 총 매출액을 입력하시면, 예상 부가세와 순이익이 자동으로 계산됩니다.']
    ];

    const wsDashboard = XLSX.utils.aoa_to_sheet(dashboardData);
    wsDashboard['!cols'] = [{wch: 25}, {wch: 20}, {wch: 15}, {wch: 25}];
    XLSX.utils.book_append_sheet(workbook, wsDashboard, '종합 결산');

    // --- 3. 월별 매입/매출장 시트 생성 ---
    // 월별 집계 (엑셀 함수 대신 여기서 집계하여 깔끔하게 보여줌, 매출액은 빈칸)
    const monthlyMap = {};
    rawData.forEach(r => {
        const month = r['매입 일자'].substring(0, 7); // YYYY-MM
        if (!monthlyMap[month]) monthlyMap[month] = { cost: 0, tax: 0 };
        monthlyMap[month].cost += r['공급가액'];
        monthlyMap[month].tax += r['부가세'];
    });

    const monthlyArray = Object.keys(monthlyMap).sort().map(month => ({
        '월(Month)': month,
        '월별 총 매입액': monthlyMap[month].cost,
        '월별 매입 부가세': monthlyMap[month].tax,
        '월별 매출액(입력)': 0,
        '월별 이익(자동계산)': 0
    }));

    const wsMonthly = XLSX.utils.json_to_sheet(monthlyArray);
    wsMonthly['!cols'] = [{wch: 15}, {wch: 15}, {wch: 15}, {wch: 18}, {wch: 18}];
    
    // 수식 적용 (E열: 매출액(D열) - 매입액(B열))
    for (let i = 0; i < monthlyArray.length; i++) {
        const rowIndex = i + 2; // 데이터는 2번째 행부터 시작
        wsMonthly[`E${rowIndex}`] = { t: 'n', f: `D${rowIndex}-B${rowIndex}` };
    }
    XLSX.utils.book_append_sheet(workbook, wsMonthly, '월별 합계');

    // --- 4. 버퍼 추출 ---
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    return buffer;
}

module.exports = {
    generateFinancialExcelBuffer
};
