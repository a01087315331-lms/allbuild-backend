// server/server.js
// Express 백엔드 서버 메인 진입점

const express = require('express');
const cors = require('cors');
const helmet = require('helmet'); // [보안] 웹 취약점 방어를 위한 Helmet 패키지 로드
const path = require('path');
const fs = require('fs');
require('dotenv').config();

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
app.use(express.json({ limit: '10mb' }));

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
    res.json({ status: 'ok', message: '올빌드 백엔드 서버가 정상적으로 실행 중입니다.' });
});

// 메인 비즈니스 로직 라우터 연결
const apiRoutes = require('./routes/api');
app.use('/api', apiRoutes);

// 서버 시작
app.listen(PORT, '0.0.0.0', () => {
    console.log(`서버가 포트 ${PORT}에서 모든 IP를 대상으로 실행 중입니다.`);
});

