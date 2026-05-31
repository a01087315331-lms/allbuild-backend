// server/routes/api.js
// 클라이언트(프론트엔드) 요청을 처리하는 API 라우터

const express = require('express');
const router = express.Router();
const { scrapeProducts } = require('../utils/scraper');
const { generateExcelBuffer } = require('../utils/excelGenerator');
const { supabase } = require('../utils/supabaseClient'); // [DB] Supabase 클라이언트 로드
const { encrypt, decrypt } = require('../utils/crypto'); // [보안] 암호화/복호화 유틸리티 로드
const { hashPassword, comparePassword } = require('../utils/auth'); // [보안] 인증 유틸리티 로드
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const nodemailer = require('nodemailer'); // [신규] 이메일 발송을 위한 nodemailer 로드

// 메모리에 파일을 보관하는 multer 설정
const upload = multer({ storage: multer.memoryStorage() });
const { extractSelectedProducts, generateReportData, generateDailyAndMonthlyReports } = require('../utils/reportGenerator');
const Tesseract = require('tesseract.js');

/**
 * [GET] /api/search
 * 상품 스펙(키워드)을 받아 스크래핑 후 결과를 반환합니다.
 */
router.get('/search', async (req, res) => {
    const keyword = req.query.keyword;
    
    if (!keyword) {
        return res.status(400).json({ error: '검색어(keyword)가 필요합니다.' });
    }

    try {
        console.log(`[API] '${keyword}' 검색 요청 수신됨.`);
        // Playwright 기반 스크래핑 엔진 실행
        const products = await scrapeProducts(keyword);
        
        return res.json({
            success: true,
            data: products
        });
    } catch (error) {
        console.error('[API 에러] 검색 중 오류 발생:', error);
        return res.status(500).json({ error: '서버 내부 스크래핑 오류가 발생했습니다.' });
    }
});

/**
 * [POST] /api/download-excel
 * 검색된 상품 데이터(JSON)를 받아 엑셀 파일(.xlsx)로 변환 후 다운로드 응답을 보냅니다.
 */
router.post('/download-excel', (req, res) => {
    const products = req.body.products;

    if (!products || !Array.isArray(products) || products.length === 0) {
        return res.status(400).json({ error: '엑셀로 변환할 상품 데이터가 없습니다.' });
    }

    try {
        // 엑셀 버퍼 생성
        const excelBuffer = generateExcelBuffer(products);

        // HTTP 응답 헤더 설정 (엑셀 다운로드 유도)
        res.setHeader('Content-Disposition', 'attachment; filename="result.xlsx"');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        
        // 버퍼 전송
        return res.send(excelBuffer);
    } catch (error) {
        console.error('[API 에러] 엑셀 생성 중 오류 발생:', error);
        return res.status(500).json({ error: '엑셀 파일 생성 중 오류가 발생했습니다.' });
    }
});

/**
 * [POST] /api/ocr
 * 업로드된 이미지(상품 라벨/박스)에서 텍스트를 추출하여 반환합니다.
 */
router.post('/ocr', upload.single('image'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: '업로드된 이미지가 없습니다.' });
    }

    try {
        console.log(`[API] 이미지 OCR 요청 수신됨: ${req.file.originalname} (${req.file.size} bytes)`);
        
        // Tesseract.js 실행 (한글 + 영문)
        const { data: { text } } = await Tesseract.recognize(
            req.file.buffer,
            'kor+eng',
            { logger: m => console.log(`[OCR 진행중] ${m.status} - ${(m.progress * 100).toFixed(1)}%`) }
        );

        // 추출된 텍스트 전처리 (줄바꿈 제거, 연속된 공백 축소)
        const cleanText = text.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
        
        console.log(`[API] OCR 추출 완료: ${cleanText}`);
        return res.json({ success: true, text: cleanText });
    } catch (error) {
        console.error('[API 에러] OCR 처리 중 오류 발생:', error);
        return res.status(500).json({ error: '이미지에서 글자를 추출하는 중 오류가 발생했습니다.' });
    }
});

/**
 * [POST] /api/upload-excel
 * 사용자가 발주 체크를 마친 엑셀 파일을 업로드하면, 데이터를 분석하여 발주 보고서를 반환합니다.
 */
router.post('/upload-excel', upload.single('excelFile'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: '업로드된 파일이 없습니다.' });
    }

    try {
        console.log(`[API] 엑셀 파일 업로드 수신됨: ${req.file.originalname}`);
        
        // 1. 엑셀 파싱하여 발주 선택된 상품만 추출
        const selectedItems = extractSelectedProducts(req.file.buffer);
        
        if (selectedItems.length === 0) {
            return res.json({ 
                success: false, 
                message: '엑셀에서 "발주 선택" 칸에 체크된 상품이 없습니다.' 
            });
        }

        // 2. 발주 보고서 데이터 생성
        const reportData = generateReportData(selectedItems, 'ORDER');

        // 3. [DB 추가] 발주 내역을 데이터베이스에 자동으로 저장합니다.
        const saveOrders = async () => {
            const ordersToInsert = reportData.items.map(item => ({
                mall_name: item.mall,
                product_name: item.name,
                price: item.price,
                tax: item.tax,
                shipping_fee: item.shipping_fee,
                total_price: item.price + item.tax + item.shipping_fee,
                shipping_days: parseInt(item.shipping_days) || 0,
                order_status: 'COMPLETED',
                order_date: new Date()
            }));

            const { error } = await supabase
                .from('orders')
                .insert(ordersToInsert);

            if (error) {
                console.error('[DB 에러] 발주 내역 저장 중 오류:', error);
                throw error;
            }
        };

        try {
            await saveOrders();
            // [보고서] 발주 등록 완료 후 비동기로 일별/월별 보고서 자동 빌드
            generateDailyAndMonthlyReports().catch(err => console.error('[보고서 생성 실패]:', err));

            return res.json({
                success: true,
                message: '성공적으로 발주 보고서가 생성되었으며 DB에 기록되었습니다.',
                report: reportData
            });
        } catch (dbError) {
            return res.status(500).json({
                success: false,
                message: `데이터베이스 저장 중 오류가 발생했습니다: ${dbError.message || '알 수 없는 DB 오류'}`,
                debug: dbError
            });
        }
        
    } catch (error) {
        console.error('[API 에러] 엑셀 업로드 처리 중 오류 발생:', error);
        return res.status(500).json({ error: '업로드 파일 처리 중 서버 오류가 발생했습니다.' });
    }
});

const { generateFinancialExcelBuffer } = require('../utils/taxReportGenerator');

/**
 * [POST] /api/financial-report
 * 사업자 정보와 매입(발주) 데이터를 기반으로 결산 엑셀을 생성합니다.
 */
router.post('/financial-report', (req, res) => {
    const { businessInfo, items } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: '결산할 매입 데이터가 없습니다.' });
    }

    try {
        const excelBuffer = generateFinancialExcelBuffer(businessInfo || { name: '미등록', number: '미등록' }, items);

        // HTTP 응답 헤더 설정 (엑셀 다운로드 유도)
        res.setHeader('Content-Disposition', 'attachment; filename="financial_report.xlsx"');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        
        return res.send(excelBuffer);
    } catch (error) {
        console.error('[API 에러] 결산 엑셀 생성 중 오류 발생:', error);
        return res.status(500).json({ error: '결산 엑셀 파일 생성 중 오류가 발생했습니다.' });
    }
});

/**
 * [GET] /api/business-info
 * DB에서 사업자 정보를 가져와 복호화 후 반환합니다.
 */
router.get('/business-info', async (req, res) => {
    try {
        // DB에서 가장 최근에 저장된 사업자 정보 1건을 가져옵니다.
        const { data, error } = await supabase
            .from('business_info')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (error && error.code !== 'PGRST116') {
            throw error;
        }

        if (!data) {
            return res.json({ success: true, data: null });
        }

        // 보안을 위해 저장된 암호화 데이터를 다시 평문으로 복호화합니다.
        const decryptedName = decrypt(data.business_name) || '';
        const decryptedNumber = decrypt(data.business_number) || '';

        const [name, address] = decryptedName.split('|||');
        const [number, phone] = decryptedNumber.split('|||');

        const decryptedData = {
            name: name || '',
            number: number || '',
            address: address || '',
            phone: phone || ''
        };

        return res.json({ success: true, data: decryptedData });
    } catch (error) {
        console.error('[API 에러] 사업자 정보 조회 중 오류:', error);
        return res.status(500).json({ error: '사업자 정보를 불러오는 중 오류가 발생했습니다.' });
    }
});

/**
 * [POST] /api/business-info
 * 사업자 정보를 암호화하여 DB에 저장합니다. (기존 데이터가 있으면 업데이트)
 */
router.post('/business-info', async (req, res) => {
    const { name, number, address, phone } = req.body;

    if (!name || !number || !address || !phone) {
        return res.status(400).json({ error: '상호명, 사업자번호, 주소, 전화번호가 모두 필요합니다.' });
    }

    try {
        // [보안] 민감한 정보를 DB에 넣기 전에 암호화합니다.
        const packedName = `${name}|||${address}`;
        const packedNumber = `${number}|||${phone}`;
        const encryptedName = encrypt(packedName);
        const encryptedNumber = encrypt(packedNumber);

        // 기존 데이터가 있는지 확인 (가장 최근 1건)
        const { data: existing } = await supabase
            .from('business_info')
            .select('id')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        let result;
        if (existing) {
            // 기존 데이터 수정
            result = await supabase
                .from('business_info')
                .update({
                    business_name: encryptedName,
                    business_number: encryptedNumber,
                    updated_at: new Date()
                })
                .eq('id', existing.id);
        } else {
            // 새 데이터 삽입
            result = await supabase
                .from('business_info')
                .insert([{
                    business_name: encryptedName,
                    business_number: encryptedNumber
                }]);
        }

        if (result.error) throw result.error;

        return res.json({ success: true, message: '사업자 정보가 안전하게 저장되었습니다.' });
    } catch (error) {
        console.error('[API 에러] 사업자 정보 저장 중 오류:', error);
        return res.status(500).json({ error: '사업자 정보를 저장하는 중 오류가 발생했습니다.' });
    }
});

/**
 * [GET] /api/financial-stats
 * DB에 저장된 모든 발주 데이터를 집계하여 통계를 반환합니다.
 */
router.get('/financial-stats', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('orders')
            .select('*')
            .order('order_date', { ascending: false })
            .order('id', { ascending: true });

        if (error) throw error;

        // 집계 로직
        const stats = {
            totalPurchase: 0, // 총 매입액
            totalTax: 0,      // 총 부가세
            totalRevenue: 0,  // 총 매출액
            items: data || []
        };

        if (data && Array.isArray(data)) {
            data.forEach(item => {
                stats.totalPurchase += Number(item.price) || 0;
                stats.totalTax += Number(item.tax) || 0;
                stats.totalRevenue += Number(item.revenue) || 0;
            });
        }

        return res.json({ success: true, data: stats });
    } catch (error) {
        console.error('[API 에러] 통계 조회 중 오류:', error);
        return res.status(500).json({ error: '재무 통계를 불러오는 중 오류가 발생했습니다.' });
    }
});

/**
 * [GET] /api/download-settlement
 * DB의 모든 발주 내역을 바탕으로 결산 엑셀 파일을 생성합니다 (하위 호환용).
 */
router.get('/download-settlement', async (req, res) => {
    console.log('[결산 GET 요청] 데이터 조회를 시작합니다...');
    try {
        const { data: orders, error } = await supabase
            .from('orders')
            .select('*')
            .order('order_date', { ascending: false })
            .order('id', { ascending: true });

        if (error) {
            console.error('[DB 에러]:', error.message);
            throw error;
        }

        console.log(`[결산 요청] ${orders?.length || 0}건의 데이터를 찾았습니다.`);

        console.log('[결산 요청] 엑셀 생성을 시작합니다...');
        const excelGenerator = require('../utils/excelGenerator');
        const buffer = await excelGenerator.generateSettlementExcel(orders || []);

        console.log('[결산 요청] 엑셀 생성 완료! 전송을 시작합니다.');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=allbuild_settlement.xlsx');
        
        return res.send(buffer);
    } catch (error) {
        console.error('[결산 에러 상세]:', error);
        return res.status(500).json({ success: false, message: `서버 오류: ${error.message}` });
    }
});

/**
 * [POST] /api/download-settlement
 * 실시간 최저가 검색결과와 사업자 정보를 함께 취합하여 기업 표준 3개 탭 결산 엑셀 파일을 생성하고,
 * PC 로컬 지정 폴더(`C:\올빌드거래자료`)에 자동으로 저장합니다.
 */
router.post('/download-settlement', async (req, res) => {
    const { businessInfo, searchResults } = req.body;
    console.log('[결산 POST 요청] 통합 데이터 조회를 시작합니다...');
    try {
        const { data: orders, error } = await supabase
            .from('orders')
            .select('*')
            .order('order_date', { ascending: false })
            .order('id', { ascending: true });

        if (error) {
            console.error('[DB 에러]:', error.message);
            throw error;
        }

        console.log(`[결산 요청] ${orders?.length || 0}건의 데이터를 찾았습니다.`);

        console.log('[결산 요청] 엑셀 생성을 시작합니다...');
        const excelGenerator = require('../utils/excelGenerator');
        const buffer = await excelGenerator.generateSettlementExcel(orders || [], businessInfo || {}, searchResults || []);

        // --- [신규] 로컬 PC 지정 폴더 C:\올빌드거래자료 에 자동으로 저장하는 엔진 ---
        const localDestDir = 'C:\\올빌드거래자료';
        let savedLocalPath = '';
        try {
            if (!fs.existsSync(localDestDir)) {
                fs.mkdirSync(localDestDir, { recursive: true });
                console.log(`[세무 결산] 로컬 저장 폴더가 없어 생성했습니다: ${localDestDir}`);
            }
            
            const dateStr = new Date().toISOString().split('T')[0];
            const timeStr = new Date().toTimeString().split(' ')[0].replace(/:/g, '');
            const localFileName = `${businessInfo?.name || '올빌드'}_통합결산보고서_${dateStr}_${timeStr}.xlsx`;
            const localFilePath = path.join(localDestDir, localFileName);
            
            fs.writeFileSync(localFilePath, buffer);
            savedLocalPath = localFilePath;
            console.log(`[세무 결산] 로컬 PC 자동 저장 완료: ${localFilePath}`);
        } catch (localWriteErr) {
            console.error('[세무 결산] C:\\올빌드거래자료 저장 실패 (권한 에러 등):', localWriteErr.message);
            
            // C드라이브 루트 쓰기 권한이 없을 경우 프로젝트 내부의 백업 디렉터리에 저장 처리
            const backupDir = path.join(__dirname, '../올빌드거래자료');
            if (!fs.existsSync(backupDir)) {
                fs.mkdirSync(backupDir, { recursive: true });
            }
            const dateStr = new Date().toISOString().split('T')[0];
            const timeStr = new Date().toTimeString().split(' ')[0].replace(/:/g, '');
            const backupFilePath = path.join(backupDir, `${businessInfo?.name || '올빌드'}_통합결산보고서_${dateStr}_${timeStr}.xlsx`);
            
            fs.writeFileSync(backupFilePath, buffer);
            savedLocalPath = backupFilePath;
            console.log(`[세무 결산] 프로젝트 백업 경로 저장 완료: ${backupFilePath}`);
        }

        console.log('[결산 요청] 엑셀 생성 완료! 전송을 시작합니다.');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=allbuild_settlement.xlsx');
        
        // 브라우저에서도 즉시 다운로드 가능하도록 버퍼 전송
        return res.send(buffer);
    } catch (error) {
        console.error('[결산 에러 상세]:', error);
        return res.status(500).json({ success: false, message: `서버 오류: ${error.message}` });
    }
});

/**
 * [POST] /api/orders/:id/revenue
 * 특정 발주 건의 매출액 및 매입 분개 항목들을 업데이트합니다.
 */
router.post('/orders/:id/revenue', async (req, res) => {
    const { id } = req.params;
    const { revenue, price, tax, total_price, quantity } = req.body;

    try {
        const updateData = {};
        if (revenue !== undefined) updateData.revenue = Number(revenue) || 0;
        if (price !== undefined) updateData.price = Number(price) || 0;
        if (tax !== undefined) updateData.tax = Number(tax) || 0;
        if (total_price !== undefined) updateData.total_price = Number(total_price) || 0;
        if (quantity !== undefined) updateData.quantity = Number(quantity) || 1;

        const { error } = await supabase
            .from('orders')
            .update(updateData)
            .eq('id', id);

        if (error) throw error;

        // [보고서] 업데이트 성공 후 비동기로 일별/월별 보고서 자동 빌드
        generateDailyAndMonthlyReports().catch(err => console.error('[보고서 생성 실패]:', err));

        return res.json({ success: true, message: '주문 재무 정보가 업데이트되었습니다.' });
    } catch (error) {
        console.error('[API 에러] 주문 재무 정보 업데이트 중 오류:', error);
        return res.status(500).json({ error: '주문 재무 정보 수정 중 오류가 발생했습니다.' });
    }
});

/**
 * [GET] /api/auth/check-setup
 * '올빌드' 계정의 비밀번호가 설정되어 있는지 확인합니다.
 */
router.get('/auth/check-setup', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('member_accounts')
            .select('password_hash')
            .eq('username', 'allbuild')
            .single();

        if (error && error.code !== 'PGRST116') throw error;

        // 데이터가 없거나 password_hash가 비어있으면 미설정 상태
        const isSetup = !!(data && data.password_hash);
        return res.json({ success: true, isSetup });
    } catch (error) {
        console.error('[AUTH] 설정 확인 에러:', error);
        return res.status(500).json({ error: '인증 설정 확인 중 오류가 발생했습니다.' });
    }
});

/**
 * [POST] /api/auth/setup
 * 최초 비밀번호를 설정합니다. (본사 6자 이상, 현장 4자 이상 동적 보안 검증)
 */
router.post('/auth/setup', async (req, res) => {
    const { username, password } = req.body;
    const targetUser = username || 'allbuild';

    if (!password) {
        return res.status(400).json({ error: '비밀번호가 필요합니다.' });
    }
    
    // [보안 규칙] 본사는 최소 6자 이상, 현장은 최소 4자 이상 강도 검증
    const minLength = targetUser === 'allbuild' ? 6 : 4;
    if (password.length < minLength) {
        return res.status(400).json({ error: `비밀번호는 ${minLength}자 이상이어야 합니다.` });
    }

    try {
        // 기존 계정이 데이터베이스에 등록되어 있는지 확인합니다.
        const { data: existing } = await supabase
            .from('member_accounts')
            .select('id, password_hash')
            .eq('username', targetUser)
            .single();

        const hashedPassword = await hashPassword(password);
        const displayName = targetUser === 'allbuild' ? '올빌드 관리자' : '현장 담당자';
        const userRole = targetUser === 'allbuild' ? 'ADMIN' : 'USER';
        
        let result;
        if (existing) {
            result = await supabase
                .from('member_accounts')
                .update({ password_hash: hashedPassword, real_name_encrypted: encrypt(displayName) })
                .eq('id', existing.id);
        } else {
            result = await supabase
                .from('member_accounts')
                .insert([{ 
                    username: targetUser, 
                    password_hash: hashedPassword, 
                    real_name_encrypted: encrypt(displayName),
                    role: userRole
                }]);
        }

        if (result.error) throw result.error;
        return res.json({ success: true, message: `${displayName} 비밀번호가 성공적으로 설정되었습니다.` });
    } catch (error) {
        console.error('[AUTH] 비밀번호 설정 에러:', error);
        return res.status(500).json({ error: '비밀번호 설정 중 오류가 발생했습니다.' });
    }
});

/**
 * [POST] /api/auth/login
 * 로그인을 처리합니다. (본사 6자 이상, 현장 4자 이상 동적 보안 검증)
 */
router.post('/auth/login', async (req, res) => {
    const { username, password } = req.body;
    
    console.log(`[AUTH] 로그인 시도 - 아이디: ${username}`);
    
    if (!username || !password) {
        return res.status(400).json({ error: '아이디와 비밀번호를 모두 입력해주세요.' });
    }

    // [보안 규칙] 본사는 최소 6자 이상, 현장은 최소 4자 이상 검증
    const minLength = username === 'allbuild' ? 6 : 4;
    if (password.length < minLength) {
        return res.status(400).json({ error: `비밀번호는 ${minLength}자 이상이어야 합니다.` });
    }

    try {
        const { data, error } = await supabase
            .from('member_accounts')
            .select('*')
            .eq('username', username)
            .single();

        if (error || !data) {
            console.log(`[AUTH] 로그인 실패 - 유저를 찾을 수 없음: ${username}`);
            return res.status(401).json({ error: '아이디 또는 비밀번호가 일치하지 않습니다.' });
        }

        // 비밀번호 비교
        const isMatch = await comparePassword(password, data.password_hash);
        console.log(`[AUTH] 비밀번호 대조 결과: ${isMatch ? '일치' : '불일치'}`);

        if (!isMatch) {
            return res.status(401).json({ error: '아이디 또는 비밀번호가 일치하지 않습니다.' });
        }

        return res.json({ 
            success: true, 
            message: '로그인 성공!',
            user: { username: data.username, role: data.role }
        });
    } catch (error) {
        console.error('[AUTH] 로그인 에러:', error);
        return res.status(500).json({ error: '로그인 처리 중 오류가 발생했습니다.' });
    }
});

/**
 * [GET] /api/reports
 * 자동 생성된 일별/월별 손익 슬라이드 HTML 보고서 목록을 조회합니다.
 */
router.get('/reports', async (req, res) => {
    try {
        const reportsDir = path.join(__dirname, '../reports');
        if (!fs.existsSync(reportsDir)) {
            return res.json({ success: true, reports: [] });
        }
        
        fs.readdir(reportsDir, (err, files) => {
            if (err) {
                return res.status(500).json({ error: '보고서 폴더를 읽는 데 실패했습니다.' });
            }
            
            const htmlFiles = files.filter(f => f.endsWith('.html') && (f.startsWith('daily_report_') || f.startsWith('monthly_report_')));
            const reports = htmlFiles.map(file => {
                const isDaily = file.startsWith('daily_report_');
                const isMonthly = file.startsWith('monthly_report_');
                let period = '';
                if (isDaily) {
                    period = file.replace('daily_report_', '').replace('.html', '');
                } else if (isMonthly) {
                    period = file.replace('monthly_report_', '').replace('.html', '');
                }
                
                const filePath = path.join(reportsDir, file);
                const stats = fs.statSync(filePath);
                
                return {
                    fileName: file,
                    type: isDaily ? 'DAILY' : (isMonthly ? 'MONTHLY' : 'UNKNOWN'),
                    period: period,
                    url: `/reports/${file}`,
                    createdAt: stats.mtime
                };
            });
            
            reports.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            return res.json({ success: true, reports });
        });
    } catch (error) {
        console.error('[API 에러] 보고서 목록 조회 실패:', error);
        return res.status(500).json({ error: '보고서 목록을 조회하는 중 서버 오류가 발생했습니다.' });
    }
});

/**
 * [GET] /api/download-template
 * 현장용 자재주문요청서 HTML 양식 파일을 다운로드합니다.
 */
router.get('/download-template', (req, res) => {
    const templatePath = path.join(__dirname, '../templates/order_template.html');
    if (!fs.existsSync(templatePath)) {
        return res.status(404).json({ error: '자재주문요청서 양식 템플릿 파일을 찾을 수 없습니다.' });
    }
    
    fs.readFile(templatePath, 'utf8', (err, data) => {
        if (err) {
            console.error('[API 에러] 양식 파일 로드 실패:', err);
            return res.status(500).json({ error: '서버 내부 파일 로드 실패 오류가 발생했습니다.' });
        }
        
        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
        const host = req.headers['x-forwarded-host'] || req.get('host');
        const apiHost = `${protocol}://${host}`;
        
        const parsedHtml = data.replace('%%API_HOST%%', apiHost);
        
        res.setHeader('Content-Disposition', 'attachment; filename="allbuild_order_form.html"');
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.send(parsedHtml);
    });
});

/**
 * [POST] /api/orders/bulk-register
 * 현장 자재주문서 양식에서 접수된 주문 목록을 일괄적으로 DB에 저장합니다. (site_name 컬럼 기록 지원)
 */
router.post('/orders/bulk-register', async (req, res) => {
    const { site_name, requester, items } = req.body;
    
    if (!site_name || !requester || !items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: '필수 주문 정보(현장명, 신청자, 자재 목록)가 누락되었습니다.' });
    }

    try {
        console.log(`[API] 현장 주문 접수 시작 - 현장: ${site_name}, 신청자: ${requester}, 품목수: ${items.length}`);
        
        const ordersToInsert = items.map(item => {
            const price = Number(item.price) || 0;
            const tax = Number(item.tax) || 0;
            const shipping = Number(item.shipping_fee) || 0;
            
            return {
                mall_name: item.mall_name || '기타',
                product_name: `[${site_name}/${requester}] ${item.product_name || '이름 없음'}`,
                site_name: site_name, // [신규] 현장명 단독 컬럼 저장
                price: price,
                tax: tax,
                shipping_fee: shipping,
                total_price: price + tax + shipping,
                order_status: 'COMPLETED',
                order_date: new Date()
            };
        });

        const { error } = await supabase
            .from('orders')
            .insert(ordersToInsert);

        if (error) {
            console.error('[DB 에러] 현장 주문 일괄 저장 실패:', error);
            throw error;
        }

        generateDailyAndMonthlyReports().catch(err => console.error('[보고서 생성 실패]:', err));

        console.log(`[API] 현장 주문 일괄 접수 완료! 건수: ${items.length}`);
        return res.json({
            success: true,
            message: '주문서가 성공적으로 접수되어 DB에 저장되었습니다.',
            insertedCount: items.length
        });

    } catch (err) {
        console.error('[API 에러] 현장 주문 접수 실패:', err);
        return res.status(500).json({ error: `주문 접수 처리 중 서버 오류가 발생했습니다: ${err.message || err}` });
    }
});

/**
 * [POST] /api/parser/submit-form
 * 외부 HTML 양식 폼 제출 업로드 접수 핸들러
 */
const templateUpload = upload.fields([
    { name: 'photoFiles', maxCount: 5 },
    { name: 'excelFile', maxCount: 1 }
]);

router.post('/parser/submit-form', templateUpload, async (req, res) => {
    const { items, site_name, requester, address, phone, email } = req.body;
    
    if (!items) {
        return res.status(400).send('<h2>[오류] 자재 신청 목록 데이터가 누락되었습니다.</h2>');
    }
    
    const site = site_name ? site_name.trim() : '미지정현장';
    const worker = requester ? requester.trim() : '미상신청자';
    const tel = phone ? phone.trim() : '연락처미기재';
    const mail = email ? email.trim() : '이메일미기재';
    const addr = address ? address.trim() : '주소미기재';
    const parsedItems = JSON.parse(items);

    const savedFilesInfo = [];

    try {
        const uploadDir = path.join(__dirname, '../uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }

        // 사진 파일 저장
        if (req.files && req.files.photoFiles) {
            req.files.photoFiles.forEach(file => {
                const uniqueName = `${Date.now()}_${file.originalname}`;
                const savePath = path.join(uploadDir, uniqueName);
                fs.writeFileSync(savePath, file.buffer);
                
                const protocol = req.headers['x-forwarded-proto'] || req.protocol;
                const host = req.headers['x-forwarded-host'] || req.get('host');
                const url = `${protocol}://${host}/uploads/${uniqueName}`;
                savedFilesInfo.push({ name: file.originalname, url: url, type: 'photo' });
            });
        }

        // 엑셀 파일 저장
        if (req.files && req.files.excelFile && req.files.excelFile[0]) {
            const file = req.files.excelFile[0];
            const uniqueName = `${Date.now()}_${file.originalname}`;
            const savePath = path.join(uploadDir, uniqueName);
            fs.writeFileSync(savePath, file.buffer);
            
            const protocol = req.headers['x-forwarded-proto'] || req.protocol;
            const host = req.headers['x-forwarded-host'] || req.get('host');
            const url = `${protocol}://${host}/uploads/${uniqueName}`;
            savedFilesInfo.push({ name: file.originalname, url: url, type: 'excel' });
        }

        let attachmentText = '';
        if (savedFilesInfo.length > 0) {
            const links = savedFilesInfo.map(f => {
                const label = f.type === 'photo' ? '📷사진' : '📊엑셀';
                return `[${label}](${f.url})`;
            }).join(' ');
            attachmentText = ` (📎첨부: ${links})`;
        }

        // Supabase DB orders 테이블에 넣을 인서트 객체 배열 가공
        const ordersToInsert = parsedItems.map(item => {
            const price = Number(item.price) || 0;
            const tax = Number(item.tax) || 0;
            const shipping = Number(item.shipping_fee) || 0;
            const qty = Number(item.quantity || item.qty) || 1; // 주문서 수량(quantity/qty) 파싱
            
            return {
                mall_name: item.mall_name || '현장직접입력',
                product_name: `[${site}/${worker}/${tel}/${mail}/${addr}] ${item.product_name || '이름 없음'}${attachmentText}`,
                site_name: site, // [신규] 현장명 컬럼에 저장
                price: price,
                tax: tax,
                shipping_fee: shipping,
                total_price: price + tax + shipping,
                quantity: qty,
                order_status: 'COMPLETED',
                order_date: new Date()
            };
        });

        const { error } = await supabase
            .from('orders')
            .insert(ordersToInsert);

        if (error) {
            console.error('[DB 저장 에러] 현장 주문 데이터 저장 실패:', error);
            throw error;
        }

        generateDailyAndMonthlyReports().catch(err => console.error('[보고서 생성 실패]:', err));

    } catch (err) {
        console.error('[API 처리 실패] 현장 주문 접수 중 오류:', err);
        return res.status(500).send(`<h2>[서버 오류] 주문 처리 중 에러가 발생했습니다: ${err.message || err}</h2>`);
    }

    if (req.body.isFetch === 'true') {
        return res.json({ success: true, count: parsedItems.length });
    }

    const redirectUrl = `http://localhost:5173/?source=direct-import&status=success&count=${parsedItems.length}`;
    return res.redirect(redirectUrl);
});

// --- [신규] 세무 증빙 및 영수증 1:1 매칭 API 구현 ---
/**
 * [POST] /api/orders/:id/receipt
 * 특정 발주 내역에 영수증 파일(사진)을 업로드하여 1:1 매칭(결합)시킵니다.
 */
router.post('/orders/:id/receipt', upload.single('receiptImage'), async (req, res) => {
    const { id } = req.params;

    if (!req.file) {
        return res.status(400).json({ error: '업로드된 영수증 이미지 파일이 없습니다.' });
    }

    try {
        console.log(`[영수증 업로드] 발주 ID: ${id}, 파일명: ${req.file.originalname}`);

        const uploadDir = path.join(__dirname, '../uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }

        const uniqueName = `receipt_${Date.now()}_${req.file.originalname}`;
        const savePath = path.join(uploadDir, uniqueName);
        fs.writeFileSync(savePath, req.file.buffer);

        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
        const host = req.headers['x-forwarded-host'] || req.get('host');
        const receiptUrl = `${protocol}://${host}/uploads/${uniqueName}`;

        let dbUpdateError = null;
        try {
            // receipt_url 컬럼에 1:1 결합 저장 시도
            const { error } = await supabase
                .from('orders')
                .update({ receipt_url: receiptUrl })
                .eq('id', id);

            if (error) throw error;
            console.log(`[영수증 매칭] DB orders 테이블 receipt_url 컬럼 업데이트 성공.`);
        } catch (dbErr) {
            console.warn(`[영수증 매칭] DB 컬럼 직접 업데이트 실패: ${dbErr.message}`);
            console.log(`[영수증 매칭 우회] product_name 컬럼 뒤에 문자열 링크로 우회(Fallback) 결합합니다.`);

            // DB 컬럼이 없을 경우를 대비해 기존 product_name 뒤에 텍스트 형태로 우회 결합
            const { data: orderItem } = await supabase
                .from('orders')
                .select('product_name')
                .eq('id', id)
                .single();

            if (orderItem) {
                const updatedName = `${orderItem.product_name} (📎증빙: [📷영수증](${receiptUrl}))`;
                const { error: fallbackErr } = await supabase
                    .from('orders')
                    .update({ product_name: updatedName })
                    .eq('id', id);
                if (fallbackErr) dbUpdateError = fallbackErr;
            } else {
                dbUpdateError = dbErr;
            }
        }

        if (dbUpdateError) {
            return res.status(500).json({ error: `영수증 정보 매칭 실패: ${dbUpdateError.message}` });
        }

        return res.json({
            success: true,
            message: '영수증 증빙 파일이 성공적으로 1:1 결합되었습니다.',
            receiptUrl: receiptUrl
        });

    } catch (error) {
        console.error('[영수증 업로드 에러]:', error);
        return res.status(500).json({ error: '영수증 업로드 처리 중 서버 내부 오류가 발생했습니다.' });
    }
});

// --- [신규] 견적서 이메일 발송 API 구현 ---
/**
 * [POST] /api/email/send-estimate
 * 발행된 견적서 내용을 지정된 이메일 주소로 전송합니다.
 */
router.post('/email/send-estimate', async (req, res) => {
    const { to, subject, htmlContent } = req.body;

    if (!to || !subject || !htmlContent) {
        return res.status(400).json({ error: '수신자 메일 주소, 제목, 견적서 내용이 누락되었습니다.' });
    }

    try {
        console.log(`[이메일 전송 API] 수신자: ${to}, 제목: ${subject}`);

        // .env 환경변수에서 메일 송신용 SMTP 서버 정보 파싱
        const emailUser = process.env.EMAIL_USER;
        const emailPass = process.env.EMAIL_PASS;

        // 환경변수 미설정 시, 초보자 개발 테스트 편의를 위해 Mock (가상) 성공 응답 리턴
        if (!emailUser || !emailPass) {
            console.warn('[이메일 환경변수 경고] EMAIL_USER 또는 EMAIL_PASS 환경변수가 .env 에 설정되지 않았습니다.');
            console.log('--- [MOCK EMAIL TRANSMISSION LOG] ---');
            console.log(`수신인(To): ${to}`);
            console.log(`메일제목(Subject): ${subject}`);
            console.log(`본문크기: ${htmlContent.length} bytes`);
            console.log('-------------------------------------');

            return res.json({
                success: true,
                message: '이메일이 가상(Mock)으로 전송되었습니다. (환경변수 설정 시 실제 메일 발송 작동)',
                isMock: true
            });
        }

        // 실제 Gmail/Naver SMTP 발송 설정
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: emailUser,
                pass: emailPass
            }
        });

        const mailOptions = {
            from: `"올빌드 본사 관리자" <${emailUser}>`,
            to: to,
            subject: subject,
            html: htmlContent
        };

        const info = await transporter.sendMail(mailOptions);
        console.log('[이메일 전송 성공] MessageID:', info.messageId);

        return res.json({
            success: true,
            message: '견적서 메일이 성공적으로 전송되었습니다.',
            messageId: info.messageId
        });

    } catch (error) {
        console.error('[이메일 전송 실패]:', error);
        return res.status(500).json({ error: `메일 발송 중 오류 발생: ${error.message}` });
    }
});

// --- [신규] 쇼핑몰 계정 연동 및 관리 API ---
const crypto = require('crypto');
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'allbuild-secret-key-32bytes-aes!'; // 정확히 32바이트 키 규격으로 수정함

function encryptPassword(text) {
    if (!text) return '';
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
}

// 필요시 외부에서 복호화해 크롤링 로그인 등에 활용 가능
function decryptPassword(text) {
    if (!text) return '';
    try {
        const parts = text.split(':');
        const iv = Buffer.from(parts.shift(), 'hex');
        const encryptedText = Buffer.from(parts.join(':'), 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
        let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (err) {
        console.error('[복호화 실패] 비밀번호 복호화 오류:', err.message);
        return '';
    }
}

// 1. 쇼핑몰 목록 조회
router.get('/malls', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('mall_credentials')
            .select('id, mall_name, login_id, status, last_checked_at, created_at')
            .order('mall_name', { ascending: true });

        if (error) throw error;
        return res.json({ success: true, malls: data });
    } catch (err) {
        console.error('[쇼핑몰 목록 조회 실패]:', err);
        return res.status(500).json({ error: `조회 실패: ${err.message}` });
    }
});

// 2. 쇼핑몰 추가 또는 수정
router.post('/malls', async (req, res) => {
    const { mall_name, login_id, login_pw } = req.body;

    if (!mall_name || !login_id || !login_pw) {
        return res.status(400).json({ error: '쇼핑몰명, 아이디, 비밀번호를 모두 입력해 주세요.' });
    }

    try {
        const encryptedPw = encryptPassword(login_pw);
        
        // 기존에 동일 쇼핑몰명이 존재하는지 체크하여 분기 처리 (upsert)
        const { data: existing } = await supabase
            .from('mall_credentials')
            .select('id')
            .eq('mall_name', mall_name.trim())
            .single();

        let result;
        if (existing) {
            // 업데이트
            const { data, error } = await supabase
                .from('mall_credentials')
                .update({
                    login_id: login_id.trim(),
                    login_pw_encrypted: encryptedPw,
                    status: 'ACTIVE',
                    last_checked_at: new Date(),
                    updated_at: new Date()
                })
                .eq('id', existing.id)
                .select();
            if (error) throw error;
            result = data;
        } else {
            // 인서트
            const { data, error } = await supabase
                .from('mall_credentials')
                .insert([{
                    mall_name: mall_name.trim(),
                    login_id: login_id.trim(),
                    login_pw_encrypted: encryptedPw,
                    status: 'ACTIVE',
                    last_checked_at: new Date()
                }])
                .select();
            if (error) throw error;
            result = data;
        }

        return res.json({ success: true, message: '쇼핑몰 계정 정보가 안전하게(양방향 암호화) 저장되었습니다.', data: result });
    } catch (err) {
        console.error('[쇼핑몰 계정 저장 실패]:', err);
        return res.status(500).json({ error: `저장 실패: ${err.message}` });
    }
});

// 3. 쇼핑몰 삭제
router.delete('/malls/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const { error } = await supabase
            .from('mall_credentials')
            .delete()
            .eq('id', id);

        if (error) throw error;
        return res.json({ success: true, message: '쇼핑몰 연동이 해제(삭제)되었습니다.' });
    } catch (err) {
        console.error('[쇼핑몰 계정 삭제 실패]:', err);
        return res.status(500).json({ error: `삭제 실패: ${err.message}` });
    }
});

module.exports = router;
