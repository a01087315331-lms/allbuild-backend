// server/utils/reportGenerator.js
// 엑셀 파싱 및 보고서 데이터 자동화 유틸리티 + HTML 슬라이드 보고서 빌더

const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const { supabase } = require('./supabaseClient');

/**
 * 엑셀 행 데이터에서 특정 키워드가 포함된 헤더의 값을 찾아주는 헬퍼 함수
 */
function getValueByKeyword(row, keywords) {
    const keys = Object.keys(row);
    const targetKey = keys.find(k => keywords.some(kw => k.includes(kw)));
    return targetKey ? row[targetKey] : null;
}

/**
 * 숫자가 아닌 문자(원, 컴마 등)를 제거하고 정수로 변환하는 헬퍼 함수
 */
function safeParseInt(value) {
    if (value === undefined || value === null) return 0;
    const cleaned = String(value).replace(/[^0-9]/g, '');
    return parseInt(cleaned) || 0;
}

/**
 * 업로드된 엑셀 파일(Buffer)을 파싱하여 발주 선택이 된 상품만 추출합니다.
 */
function extractSelectedProducts(fileBuffer) {
    try {
        const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet);
        
        const selected = data.filter(row => {
            const checkValue = getValueByKeyword(row, ['발주', '선택', '체크']);
            return checkValue && String(checkValue).trim() !== '';
        });

        return selected;
    } catch (error) {
        console.error('[엑셀 파싱 에러]:', error);
        throw new Error('엑셀 파일을 읽는 중 문제가 발생했습니다.');
    }
}

/**
 * 선택된 상품 배열을 바탕으로 발주서 데이터를 생성합니다.
 */
function generateReportData(selectedProducts, reportType = 'ORDER') {
    let totalCost = 0;
    let totalTax = 0;
    let totalShipping = 0;

    const items = selectedProducts.map(p => {
        const price = safeParseInt(getValueByKeyword(p, ['공급가액', '가격', '금액']));
        const tax = safeParseInt(getValueByKeyword(p, ['부가세', '세액']));
        const shippingFee = safeParseInt(getValueByKeyword(p, ['배송비']));
        
        totalCost += price;
        totalTax += tax;
        totalShipping += shippingFee;

        return {
            mall: getValueByKeyword(p, ['쇼핑몰', '몰']) || '알 수 없음',
            name: getValueByKeyword(p, ['상품명', '품명', '이름']) || '이름 없음',
            price: price,
            tax: tax,
            shipping_fee: shippingFee,
            shipping_days: getValueByKeyword(p, ['배송일', '기간']) || '-',
            date: new Date().toISOString().split('T')[0]
        };
    });

    const currentDate = new Date().toISOString().split('T')[0];

    const reportTemplate = {
        reportId: `REP-${Date.now()}`,
        reportDate: currentDate,
        type: reportType,
        title: reportType === 'ORDER' ? '올빌드 공식 발주 보고서' : `올빌드 ${reportType === 'WEEKLY' ? '주간' : '월간'} 구매 통계 보고서`,
        department: '구매팀',
        totalItems: items.length,
        financialSummary: {
            subtotal: totalCost,
            taxTotal: totalTax,
            shippingTotal: totalShipping,
            grandTotal: totalCost + totalTax + totalShipping
        },
        items: items
    };

    return reportTemplate;
}

/**
 * 프리미엄 HTML 슬라이드 리포트 생성기
 * DB의 orders 테이블에서 실시간 데이터를 읽어와 일별 및 월별 손익 보고서(HTML 파일)를 빌드합니다.
 */
async function generateDailyAndMonthlyReports() {
    try {
        console.log('[보고서 생성기] 최적화된 리포트 빌드 개시...');

        // 1. 오늘 날짜 및 이번 달 구하기 (한국 시간대 KST 보정 반영)
        const todayObj = new Date();
        const kstOffset = 9 * 60 * 60 * 1000;
        const todayKst = new Date(todayObj.getTime() + kstOffset);
        const todayStr = todayKst.toISOString().split('T')[0]; // YYYY-MM-DD
        const thisMonthStr = todayStr.substring(0, 7); // YYYY-MM

        // 2. 성능 비약적 향상을 위해 최근 3일 이내에 주문이 생성된 데이터만 선별 쿼리
        const threeDaysAgo = new Date();
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
        const threeDaysAgoStr = threeDaysAgo.toISOString().split('T')[0];

        // 전체 데이터를 긁지 않고, 최근 3일 이내의 날짜 데이터만 Supabase에서 가볍게 로드
        const { data: recentOrders, error: recentError } = await supabase
            .from('orders')
            .select('order_date')
            .gte('order_date', `${threeDaysAgoStr}T00:00:00.000Z`);

        if (recentError) throw recentError;

        // 중복을 제거하며 빌드할 타겟 날짜 및 월도를 Set으로 관리
        const targetDays = new Set();
        targetDays.add(todayStr); // 오늘 날짜 기본 탑재
        
        const targetMonths = new Set();
        targetMonths.add(thisMonthStr); // 이번 달 기본 탑재

        (recentOrders || []).forEach(item => {
            if (!item.order_date) return;
            const dateObj = new Date(item.order_date);
            const kstDate = new Date(dateObj.getTime() + kstOffset);
            const dateStr = kstDate.toISOString().split('T')[0];
            const monthStr = dateStr.substring(0, 7);
            
            targetDays.add(dateStr);
            targetMonths.add(monthStr);
        });

        // 3. 보고서 저장 폴더 확보 (server/reports)
        const reportsDir = path.join(__dirname, '../reports');
        if (!fs.existsSync(reportsDir)) {
            fs.mkdirSync(reportsDir, { recursive: true });
        }

        // 4. 타겟으로 지정된 각각의 일자별로 최신 데이터를 가져와 일별 HTML 손익표 빌드
        for (const date of targetDays) {
            const start = `${date}T00:00:00.000Z`;
            const end = `${date}T23:59:59.999Z`;
            
            const { data: dayOrders, error: dayErr } = await supabase
                .from('orders')
                .select('*')
                .gte('order_date', start)
                .lte('order_date', end)
                .order('order_date', { ascending: false });

            if (dayErr) {
                console.error(`[보고서 생성기] 일별 데이터 로딩 실패 (${date}):`, dayErr);
                continue;
            }

            if (dayOrders && dayOrders.length > 0) {
                const htmlContent = buildSlideHtml(date, dayOrders, 'DAILY');
                const filePath = path.join(reportsDir, `daily_report_${date}.html`);
                fs.writeFileSync(filePath, htmlContent, 'utf8');
                console.log(`[보고서 생성] 일별 보고서 저장 완료: ${filePath}`);
            }
        }

        // 5. 타겟으로 지정된 각각의 월별로 최신 데이터를 가져와 월별 HTML 손익표 빌드
        for (const month of targetMonths) {
            const [year, mVal] = month.split('-').map(Number);
            const start = `${month}-01T00:00:00.000Z`;
            const lastDay = new Date(year, mVal, 0).getDate();
            const end = `${month}-${lastDay}T23:59:59.999Z`;

            const { data: monthOrders, error: monthErr } = await supabase
                .from('orders')
                .select('*')
                .gte('order_date', start)
                .lte('order_date', end)
                .order('order_date', { ascending: false });

            if (monthErr) {
                console.error(`[보고서 생성기] 월별 데이터 로딩 실패 (${month}):`, monthErr);
                continue;
            }

            if (monthOrders && monthOrders.length > 0) {
                const htmlContent = buildSlideHtml(month, monthOrders, 'MONTHLY');
                const filePath = path.join(reportsDir, `monthly_report_${month}.html`);
                fs.writeFileSync(filePath, htmlContent, 'utf8');
                console.log(`[보고서 생성] 월별 보고서 저장 완료: ${filePath}`);
            }
        }

    } catch (err) {
        console.error('[보고서 생성기 예외 오류]:', err);
    }
}

/**
 * 개별 보고서의 프리미엄 HTML 코드를 작성하는 헬퍼 함수
 */
function buildSlideHtml(targetPeriod, items, type) {
    // 회계 수식 통계 집계
    let totalPurchase = 0;
    let totalTax = 0;
    let totalShipping = 0;
    let totalRevenue = 0;
    const mallStats = {};

    items.forEach(item => {
        const p = Number(item.price) || 0;
        const t = Number(item.tax) || 0;
        const s = Number(item.shipping_fee) || 0;
        const r = Number(item.revenue) || 0;

        totalPurchase += p;
        totalTax += t;
        totalShipping += s;
        totalRevenue += r;

        // 쇼핑몰 통계
        const mall = item.mall_name || '기타';
        if (!mallStats[mall]) {
            mallStats[mall] = { cost: 0, count: 0 };
        }
        mallStats[mall].cost += p + t + s;
        mallStats[mall].count += 1;
    });

    const totalPurchaseSum = totalPurchase + totalTax + totalShipping;
    const overallMargin = totalRevenue - totalPurchaseSum;
    const marginRate = totalRevenue > 0 ? Math.round((overallMargin / totalRevenue) * 100) : 0;
    const typeKorean = type === 'DAILY' ? '일별' : '월별';

    // 쇼핑몰 차트용 데이터 가공
    const chartLabels = Object.keys(mallStats);
    const chartData = chartLabels.map(label => mallStats[label].cost);

    return `<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>올빌드 ${typeKorean} 손익 보고서 (${targetPeriod})</title>
    <!-- 프리미엄 폰트 및 스타일 라이브러리 탑재 -->
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;800&family=Outfit:wght@300;400;600;800&family=Noto+Sans+KR:wght@300;400;700;900&display=swap" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        :root {
            --bg-gradient: linear-gradient(135deg, #0b0f19 0%, #111827 50%, #1e1b4b 100%);
            --primary: #6366f1;
            --primary-hover: #4f46e5;
            --success: #10b981;
            --danger: #ef4444;
            --accent: #f59e0b;
            --glass-bg: rgba(255, 255, 255, 0.03);
            --glass-border: rgba(255, 255, 255, 0.08);
            --text-main: #f3f4f6;
            --text-muted: #9ca3af;
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
            font-family: 'Outfit', 'Noto Sans KR', 'Inter', sans-serif;
        }

        body {
            background: var(--bg-gradient);
            color: var(--text-main);
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            overflow: hidden;
        }

        /* 슬라이드 프레임 */
        .slider-container {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
            padding: 2rem;
            width: 100%;
            max-width: 1200px;
            margin: 0 auto;
        }

        .slide {
            display: none;
            width: 100%;
            animation: slideIn 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
            background: rgba(15, 23, 42, 0.4);
            border: 1px solid var(--glass-border);
            border-radius: 24px;
            padding: 3rem;
            backdrop-filter: blur(20px);
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
        }

        .slide.active {
            display: block;
        }

        @keyframes slideIn {
            from {
                opacity: 0;
                transform: translateY(30px) scale(0.98);
            }
            to {
                opacity: 1;
                transform: translateY(0) scale(1);
            }
        }

        /* 헤더 스타일 */
        header {
            padding: 2rem 2rem 0;
            display: flex;
            justify-content: space-between;
            align-items: center;
            max-width: 1200px;
            width: 100%;
            margin: 0 auto;
        }

        .logo-area {
            display: flex;
            align-items: center;
            gap: 0.75rem;
        }

        .logo-tag {
            background: var(--primary);
            color: white;
            font-weight: 800;
            font-size: 0.85rem;
            padding: 0.25rem 0.75rem;
            border-radius: 8px;
            text-transform: uppercase;
            letter-spacing: 1px;
        }

        .report-title {
            font-size: 1.25rem;
            font-weight: 700;
            color: var(--text-main);
        }

        .period-badge {
            background: rgba(255, 255, 255, 0.08);
            border: 1px solid var(--glass-border);
            color: var(--accent);
            padding: 0.5rem 1rem;
            border-radius: 12px;
            font-weight: 600;
            font-size: 0.95rem;
        }

        /* 메인 슬라이드 1: 요약 */
        .summary-grid {
            display: grid;
            grid-cols: 1;
            gap: 1.5rem;
        }

        @media(min-width: 768px) {
            .summary-grid {
                grid-template-columns: repeat(4, 1fr);
            }
        }

        .stat-card {
            background: var(--glass-bg);
            border: 1px solid var(--glass-border);
            border-radius: 20px;
            padding: 1.5rem;
            transition: all 0.3s ease;
        }

        .stat-card:hover {
            border-color: var(--primary);
            transform: translateY(-5px);
            background: rgba(255, 255, 255, 0.05);
        }

        .stat-label {
            font-size: 0.85rem;
            color: var(--text-muted);
            text-transform: uppercase;
            font-weight: 600;
            letter-spacing: 0.5px;
        }

        .stat-val {
            font-size: 1.75rem;
            font-weight: 800;
            margin-top: 0.5rem;
        }

        .stat-val.primary { color: var(--primary); }
        .stat-val.success { color: var(--success); }
        .stat-val.danger { color: var(--danger); }
        .stat-val.accent { color: var(--accent); }

        .kpi-row {
            display: grid;
            grid-template-columns: 1fr;
            gap: 2rem;
            margin-top: 2rem;
        }

        @media(min-width: 768px) {
            .kpi-row {
                grid-template-columns: 1.5fr 1fr;
            }
        }

        .kpi-box {
            background: rgba(99, 102, 241, 0.05);
            border: 1px dashed rgba(99, 102, 241, 0.3);
            border-radius: 20px;
            padding: 1.5rem;
            display: flex;
            flex-direction: column;
            justify-content: center;
        }

        .kpi-text {
            font-size: 1.1rem;
            line-height: 1.6;
            color: #d1d5db;
        }

        .highlight {
            color: var(--primary);
            font-weight: 700;
        }

        /* 슬라이드 2: 차트 */
        .chart-row {
            display: grid;
            grid-template-columns: 1fr;
            gap: 2rem;
            align-items: center;
        }

        @media(min-width: 768px) {
            .chart-row {
                grid-template-columns: 1.2fr 1fr;
            }
        }

        .chart-container {
            position: relative;
            width: 100%;
            height: 300px;
            display: flex;
            justify-content: center;
            align-items: center;
        }

        .mall-list {
            display: flex;
            flex-direction: column;
            gap: 1rem;
        }

        .mall-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: var(--glass-bg);
            border: 1px solid var(--glass-border);
            padding: 1rem 1.5rem;
            border-radius: 14px;
        }

        .mall-name {
            font-weight: 600;
        }

        .mall-cost {
            font-weight: 700;
            color: var(--accent);
        }

        /* 슬라이드 3: 테이블 */
        .table-container {
            max-height: 380px;
            overflow-y: auto;
            border: 1px solid var(--glass-border);
            border-radius: 14px;
        }

        table {
            width: 100%;
            border-collapse: collapse;
            text-align: left;
        }

        th {
            background: rgba(255, 255, 255, 0.05);
            padding: 1rem;
            font-weight: 600;
            color: var(--text-muted);
            border-bottom: 2px solid var(--glass-border);
            position: sticky;
            top: 0;
            z-index: 10;
            backdrop-filter: blur(10px);
        }

        td {
            padding: 1rem;
            border-bottom: 1px solid var(--glass-border);
            color: #d1d5db;
        }

        tr:hover td {
            background: rgba(255, 255, 255, 0.02);
            color: white;
        }

        .badge-status {
            background: rgba(16, 185, 129, 0.15);
            color: var(--success);
            padding: 0.25rem 0.5rem;
            border-radius: 6px;
            font-size: 0.8rem;
            font-weight: 600;
        }

        /* 푸터 및 컨트롤러 */
        footer {
            padding: 1.5rem;
            display: flex;
            justify-content: space-between;
            align-items: center;
            max-width: 1200px;
            width: 100%;
            margin: 0 auto;
            border-top: 1px solid var(--glass-border);
        }

        .nav-buttons {
            display: flex;
            gap: 1rem;
        }

        .btn-nav {
            background: var(--glass-bg);
            border: 1px solid var(--glass-border);
            color: var(--text-main);
            padding: 0.75rem 1.5rem;
            border-radius: 12px;
            cursor: pointer;
            font-weight: 600;
            transition: all 0.2s ease;
            outline: none;
        }

        .btn-nav:hover {
            background: var(--primary);
            border-color: var(--primary);
            transform: scale(1.03);
        }

        .btn-nav:active {
            transform: scale(0.97);
        }

        .dots-container {
            display: flex;
            gap: 0.5rem;
        }

        .dot {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background: var(--glass-border);
            cursor: pointer;
            transition: all 0.3s ease;
        }

        .dot.active {
            background: var(--primary);
            width: 24px;
            border-radius: 5px;
        }

        /* 스크롤바 디자인 */
        ::-webkit-scrollbar {
            width: 6px;
        }
        ::-webkit-scrollbar-track {
            background: transparent;
        }
        ::-webkit-scrollbar-thumb {
            background: var(--glass-border);
            border-radius: 3px;
        }
        ::-webkit-scrollbar-thumb:hover {
            background: var(--text-muted);
        }
    </style>
</head>
<body>

    <header>
        <div class="logo-area">
            <span class="logo-tag">Allbuild</span>
            <span class="report-title">${typeKorean} 손익 슬라이드</span>
        </div>
        <div class="period-badge">📅 대상기간: ${targetPeriod}</div>
    </header>

    <div class="slider-container">
        <!-- 슬라이드 1: 손익 요약 보고 -->
        <div class="slide active" id="slide1">
            <h2 style="font-size: 2rem; font-weight: 800; margin-bottom: 2rem; color: white;">📈 손익 및 구매 요약 현황</h2>
            <div class="summary-grid">
                <div class="stat-card">
                    <p class="stat-label">총 발주 건수</p>
                    <p class="stat-val primary">${items.length}건</p>
                </div>
                <div class="stat-card">
                    <p class="stat-label">총 매입합계 (공급+부가+배송)</p>
                    <p class="stat-val accent">${totalPurchaseSum.toLocaleString()}원</p>
                </div>
                <div class="stat-card">
                    <p class="stat-label">총 매출액</p>
                    <p class="stat-val primary">${totalRevenue.toLocaleString()}원</p>
                </div>
                <div class="stat-card">
                    <p class="stat-label">예상 순이익 (마진)</p>
                    <p class="stat-val ${overallMargin >= 0 ? 'success' : 'danger'}">${overallMargin.toLocaleString()}원</p>
                </div>
            </div>

            <div class="kpi-row">
                <div class="kpi-box">
                    <p class="kpi-text">
                        본 기간 동안 총 <span class="highlight">${items.length}건</span>의 자재 발주 신청이 완료되었으며, 
                        총 매입비용은 <span class="highlight">${totalPurchaseSum.toLocaleString()}원</span>입니다. 
                        이에 따른 판매 매출액은 <span class="highlight">${totalRevenue.toLocaleString()}원</span>이며, 
                        최종 예상 순수익은 <span class="highlight">${overallMargin.toLocaleString()}원</span>(마진율 <span class="highlight">${marginRate}%</span>)으로 집계되었습니다.
                    </p>
                </div>
                <div class="stat-card" style="display: flex; flex-direction: column; justify-content: center; align-items: center;">
                    <p class="stat-label" style="text-align: center;">종합 수익 마진율</p>
                    <p class="stat-val success" style="font-size: 3rem; margin-top: 0.5rem;">${marginRate}%</p>
                </div>
            </div>
        </div>

        <!-- 슬라이드 2: 쇼핑몰별 매입 비중 -->
        <div class="slide" id="slide2">
            <h2 style="font-size: 2rem; font-weight: 800; margin-bottom: 2rem; color: white;">🛒 쇼핑몰별 구매 분포</h2>
            <div class="chart-row">
                <div class="chart-container">
                    <canvas id="mallPieChart"></canvas>
                </div>
                <div class="mall-list">
                    <p class="stat-label" style="margin-bottom: 0.5rem;">쇼핑몰별 상세 매입액</p>
                    ${Object.entries(mallStats).map(([name, data]) => `
                        <div class="mall-item">
                            <span class="mall-name">🛍️ ${name} <span style="font-weight: 400; font-size: 0.85rem; color: var(--text-muted);">(${data.count}건)</span></span>
                            <span class="mall-cost">${data.cost.toLocaleString()}원</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>

        <!-- 슬라이드 3: 세부 항목 명세서 -->
        <div class="slide" id="slide3">
            <h2 style="font-size: 2rem; font-weight: 800; margin-bottom: 1.5rem; color: white;">📋 세부 자재 신청 및 발주 내역</h2>
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>쇼핑몰</th>
                            <th>상품명</th>
                            <th style="text-align: right;">매입가</th>
                            <th style="text-align: right;">배송비</th>
                            <th style="text-align: right;">매출액</th>
                            <th style="text-align: right;">순이익</th>
                            <th style="text-align: center;">상태</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${items.map(item => {
                            const p = Number(item.price) || 0;
                            const t = Number(item.tax) || 0;
                            const s = Number(item.shipping_fee) || 0;
                            const r = Number(item.revenue) || 0;
                            const cost = p + t + s;
                            const margin = r - cost;
                            return `
                            <tr>
                                <td style="font-weight: 600;">${item.mall_name}</td>
                                <td style="max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${item.product_name}</td>
                                <td style="text-align: right;">${p.toLocaleString()}원</td>
                                <td style="text-align: right; color: var(--accent);">${s.toLocaleString()}원</td>
                                <td style="text-align: right; color: var(--primary); font-weight: 700;">${r.toLocaleString()}원</td>
                                <td style="text-align: right; font-weight: 700; color: ${margin >= 0 ? 'var(--success)' : 'var(--danger)'}">${margin.toLocaleString()}원</td>
                                <td style="text-align: center;"><span class="badge-status">완료</span></td>
                            </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    <footer>
        <div class="dots-container">
            <div class="dot active" onclick="goToSlide(0)"></div>
            <div class="dot" onclick="goToSlide(1)"></div>
            <div class="dot" onclick="goToSlide(2)"></div>
        </div>
        <div class="nav-buttons">
            <button class="btn-nav" onclick="prevSlide()">이전</button>
            <button class="btn-nav" onclick="nextSlide()" style="background: var(--primary); border-color: var(--primary); color: white;">다음</button>
        </div>
    </footer>

    <script>
        let currentSlide = 0;
        const slides = document.querySelectorAll('.slide');
        const dots = document.querySelectorAll('.dot');

        function goToSlide(index) {
            slides[currentSlide].classList.remove('active');
            dots[currentSlide].classList.remove('active');
            
            currentSlide = index;
            if (currentSlide < 0) currentSlide = slides.length - 1;
            if (currentSlide >= slides.length) currentSlide = 0;

            slides[currentSlide].classList.add('active');
            dots[currentSlide].classList.add('active');
        }

        function nextSlide() {
            goToSlide(currentSlide + 1);
        }

        function prevSlide() {
            goToSlide(currentSlide - 1);
        }

        // Chart.js 연동 (쇼핑몰별 매입 비중)
        const ctx = document.getElementById('mallPieChart').getContext('2d');
        const mallChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ${JSON.stringify(chartLabels)},
                datasets: [{
                    data: ${JSON.stringify(chartData)},
                    backgroundColor: [
                        '#6366f1',
                        '#10b981',
                        '#f59e0b',
                        '#ec4899',
                        '#3b82f6',
                        '#8b5cf6'
                    ],
                    borderWidth: 2,
                    borderColor: '#1e1b4b'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: '#f3f4f6',
                            font: {
                                size: 12,
                                family: 'Outfit'
                            }
                        }
                    }
                }
            }
        });
    </script>
</body>
</html>`;
}

module.exports = {
    extractSelectedProducts,
    generateReportData,
    generateDailyAndMonthlyReports
};
