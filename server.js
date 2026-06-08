// server/server.js
// Express 백엔드 서버 메인 진입점

const express = require('express');
const cors = require('cors');
const helmet = require('helmet'); // [보안] 웹 취약점 방어를 위한 Helmet 패키지 로드
const path = require('path');
const fs = require('fs');
require('dotenv').config();
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 5000;

// [디버그] 서버로 들어오는 모든 요청 로그 실시간 출력
app.use((req, res, next) => {
    console.log(`📡 [API 요청 유입] ${req.method} ${req.url}`);
    next();
});

// [보안] 각종 HTTP 보안 헤더 설정을 유연하게 조정합니다. (다른 PC 접속 시 이미지/리소스 차단 방지)
app.use(helmet({
    crossOriginResourcePolicy: false,
    contentSecurityPolicy: false, // iframe 내 리포트 로드를 위해 CSP를 해제하거나 유연하게 조정합니다.
}));

// 미들웨어 설정
// [보안] 다른 PC(IP 주소)에서도 이 서버에 접속할 수 있도록 CORS 보안 문을 활짝 엽니다.
app.use(cors()); 

// [보안] 요청 본문 크기 제한
app.use(express.json({ limit: '50mb' }));

// [보고서] 보고서 폴더 확보 및 정적 오픈 연동
const reportsDir = path.join(__dirname, 'reports');
if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
}
app.use('/reports', express.static(reportsDir));

// [업로드] 현장 첨부파일(사진, 엑셀) 폴더 확보 및 정적 오픈 연동
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));
// 기본 테스트용 라우트
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        message: '올빌드 백엔드 서버가 정상적으로 실행 중입니다.',
        emailConfigured: !!(process.env.EMAIL_USER && process.env.EMAIL_PASS),
        emailUser: process.env.EMAIL_USER || '미설정'
    });
});

// 메인 비즈니스 로직 라우터 연결
const apiRoutes = require('./routes/api');
app.use('/api', apiRoutes);
// [스케줄러] 매월 말일 20시 경비 자동 이메일
cron.schedule('0 20 28-31 * *', async () => {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (tomorrow.getDate() !== 1) return;
    console.log('[스케줄러] 말일 경비 자동 이메일 발송 시작');
    try {
        const res = await fetch(`http://localhost:${PORT}/api/expense/auto-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await res.json();
        console.log('[스케줄러] 결과:', data.message);
    } catch(e) {
        console.error('[스케줄러] 오류:', e.message);
    }
});

// 서버 시작
app.listen(PORT, '0.0.0.0', () => {
    console.log(`서버가 포트 ${PORT}에서 모든 IP를 대상으로 실행 중입니다.`);
});

