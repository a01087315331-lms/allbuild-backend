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
const { extractSelectedProducts, generateReportData, generateDailyAndMonthlyReports: generateAllReports } = require('../utils/reportGenerator');
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
            // [보고서] 발주 등록 완료 후 비동기로 전체 보고서 자동 빌드
            generateAllReports().catch(err => console.error('[보고서 생성 실패]:', err));

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
    const { userRole } = req.query; // 요청 유저의 권한 정보 추출
    try {
        const { data, error } = await supabase
            .from('orders')
            .select('*')
            .order('order_date', { ascending: false })
            .order('id', { ascending: true });

        if (error) throw error;

        // [보안 핵심] 현장(SITE) 권한인 경우 본사의 진짜 재무/회계 데이터를 볼 수 없도록
        // 매입가, 매출가, 배송비, 부가세 등 모든 가격 수치를 0원으로 강제 조작(원천 마스킹)하여 응답합니다.
        if (userRole === 'SITE') {
            const maskedItems = (data || []).map(item => ({
                id: item.id,
                order_date: item.order_date,
                product_name: item.product_name,
                price: 0,
                tax: 0,
                shipping_fee: 0,
                total_price: 0,
                revenue: 0,
                order_status: 'COMPLETED',
                site_name: item.site_name
            }));

            const stats = {
                totalPurchase: 0,
                totalTax: 0,
                totalRevenue: 0,
                items: maskedItems
            };

            return res.json({ success: true, data: stats });
        }

        // 집계 로직 (본사 ADMIN 권한용 실제 집계)
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
 * 특정 발주 건의 매출액(수익)을 업데이트합니다.
 */
router.post('/orders/:id/revenue', async (req, res) => {
    const { id } = req.params;
    const { revenue, price, tax, total_price } = req.body;

    try {
        // [보안/확장] 프론트엔드에서 안전하게 매입가 및 매출가를 수정할 수 있도록 조건부 업데이트 객체를 생성합니다.
        const updateData = {};
        if (revenue !== undefined) updateData.revenue = Number(revenue) || 0;
        if (price !== undefined) updateData.price = Number(price) || 0;
        if (tax !== undefined) updateData.tax = Number(tax) || 0;
        if (total_price !== undefined) updateData.total_price = Number(total_price) || 0;

        const { error } = await supabase
            .from('orders')
            .update(updateData)
            .eq('id', id);

        if (error) throw error;

        // [보고서] 업데이트 성공 후 비동기로 전체 손익 보고서 자동 빌드
        generateAllReports().catch(err => console.error('[보고서 생성 실패]:', err));

        return res.json({ success: true, message: '주문 거래 세무 정보가 정상 업데이트되었습니다.' });
    } catch (error) {
        console.error('[API 에러] 주문 금액 정보 업데이트 중 오류:', error);
        return res.status(500).json({ error: '금액 정보 수정 중 서버 내부 DB 오류가 발생했습니다.' });
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
 * 최초 비밀번호를 설정합니다. (비밀번호 6자 이상 강력 제한 규칙 적용)
 */
router.post('/auth/setup', async (req, res) => {
    const { password } = req.body;
    if (!password) {
        return res.status(400).json({ error: '비밀번호가 필요합니다.' });
    }
    
    // [보안 규칙] 비밀번호 최소 6자 이상 강도 검증 정책 적용
    if (password.length < 6) {
        return res.status(400).json({ error: '비밀번호는 6자 이상이어야 합니다.' });
    }

    try {
        // 기존 계정이 데이터베이스에 등록되어 있는지 확인합니다.
        const { data: existing } = await supabase
            .from('member_accounts')
            .select('id, password_hash')
            .eq('username', 'allbuild')
            .single();

        const hashedPassword = await hashPassword(password);
        
        let result;
        if (existing) {
            result = await supabase
                .from('member_accounts')
                .update({ password_hash: hashedPassword, real_name_encrypted: encrypt('올빌드 관리자') })
                .eq('id', existing.id);
        } else {
            result = await supabase
                .from('member_accounts')
                .insert([{ 
                    username: 'allbuild', 
                    password_hash: hashedPassword, 
                    real_name_encrypted: encrypt('올빌드 관리자'),
                    role: 'ADMIN'
                }]);
        }

        if (result.error) throw result.error;
        return res.json({ success: true, message: '비밀번호가 성공적으로 설정되었습니다.' });
    } catch (error) {
        console.error('[AUTH] 비밀번호 설정 에러:', error);
        return res.status(500).json({ error: '비밀번호 설정 중 오류가 발생했습니다.' });
    }
});

/**
 * [POST] /api/auth/login
 * 로그인을 처리합니다. (비밀번호 최소 6자 이상 유효성 예외 통과)
 */
router.post('/auth/login', async (req, res) => {
    const { username, password } = req.body;
    
    console.log(`[AUTH] 로그인 시도 - 아이디: ${username}`);
    
    if (!username || !password) {
        return res.status(400).json({ error: '아이디와 비밀번호를 모두 입력해주세요.' });
    }

    // [보안 규칙] 본사 관리자(allbuild)는 6자 이상 필수, 현장 계정은 4자 이상 허용
    const isAllbuild = username === 'allbuild';
    const minLength = isAllbuild ? 6 : 4;
    if (password.length < minLength) {
        return res.status(400).json({ error: `비밀번호는 최소 ${minLength}자 이상이어야 합니다.` });
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
        console.log('[DEBUG bulk-register] 수신된 원본 자재 목록(items):', JSON.stringify(items, null, 2));
        
        const ordersToInsert = items.map(item => {
            const price = Number(item.price) || 0;
            const tax = Number(item.tax) || 0;
            const shipping = Number(item.shipping_fee) || 0;
            
            return {
                mall_name: item.mall_name || '기타',
                product_name: `[${site_name}/${requester}] ${item.product_name || '이름 없음'}`,
                // [안내] Supabase DB orders 테이블에 site_name 컬럼이 존재하지 않으므로, 에러 방지를 위해 product_name 말머리에 현장명을 인코딩하여 저장하고 site_name 필드는 제외합니다.
                price: price,
                tax: tax,
                shipping_fee: shipping,
                total_price: price + tax + shipping,
                quantity: Number(item.qty || item.quantity) || 1, // [수량 추가] qty 또는 quantity 필드를 읽어 숫자로 변환하여 저장합니다.
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

        generateAllReports().catch(err => console.error('[보고서 생성 실패]:', err));

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
    const { items, site_name, requester, address, phone, email, isFetch, returnUrl } = req.body;
    
    if (!items) {
        return res.status(400).send('<h2>[오류] 자재 신청 목록 데이터가 누락되었습니다.</h2>');
    }
    
    const site = site_name ? site_name.trim() : '미지정현장';
    const worker = requester ? requester.trim() : '미상신청자';
    const tel = phone ? phone.trim() : '연락처미기재';
    const mail = email ? email.trim() : '이메일미기재';
    const addr = address ? address.trim() : '주소미기재';
    const parsedItems = JSON.parse(items);
    console.log('[DEBUG submit-form] 파싱된 자재 목록(parsedItems):', JSON.stringify(parsedItems, null, 2));

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
            
            return {
                // [수정] 테이블 스키마에 정의된 컬럼명인 mall_name으로 올바르게 매핑하여 DB 입력 에러를 해결합니다.
                mall_name: item.mall_name || '현장직접입력',
                product_name: `[${site}/${worker}/${tel}/${mail}/${addr}] ${item.product_name || '이름 없음'}${attachmentText}`,
                // [안내] Supabase DB orders 테이블에 site_name 컬럼이 존재하지 않으므로, 에러 방지를 위해 product_name 말머리에 현장명을 인코딩하여 저장하고 site_name 필드는 제외합니다.
                price: price,
                tax: tax,
                shipping_fee: shipping,
                total_price: price + tax + shipping,
                quantity: Number(item.qty || item.quantity) || 1, // [수량 추가] qty 또는 quantity 필드를 읽어 숫자로 변환하여 저장합니다.
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

        // [로컬 PC 자동 백업] 사용자 '문서' 폴더 아래 올빌드거래자료/현장자재요청서에 보관용 HTML을 생성합니다.
        try {
            const os = require('os');
            const baseDir = path.join(os.homedir(), 'Documents/올빌드/올빌드거래자료');
            const orderDir = path.join(baseDir, '현장자재요청서');
            if (!fs.existsSync(orderDir)) {
                fs.mkdirSync(orderDir, { recursive: true });
            }

            const dateStr = new Date().toISOString().split('T')[0];
            const timeStr = new Date().toTimeString().split(' ')[0].replace(/:/g, '-');
            const filename = `올빌드_현장자재요청서_${site}_${dateStr}_${timeStr}.html`;

            const itemRows = parsedItems.map((item, idx) => {
                let rawName = item.product_name || '';
                let brand = '-';
                let prodName = rawName;

                // 1) 대괄호 포맷 파싱 시도 (예: [현대제철] 철근)
                const bracketMatch = rawName.match(/^\[([^\]]+)\]\s*(.*)$/);
                if (bracketMatch) {
                    brand = bracketMatch[1].trim();
                    prodName = bracketMatch[2].trim();
                } else {
                    // 2) 공백 포맷 파싱 시도 (예: 현대제철 철근)
                    const spaceIdx = rawName.indexOf(' ');
                    if (spaceIdx !== -1) {
                        brand = rawName.substring(0, spaceIdx).trim();
                        prodName = rawName.substring(spaceIdx + 1).trim();
                    }
                }

                return `
                  <tr style="border-bottom: 1px solid #ddd;">
                    <td style="padding: 10px; text-align: center;">${idx + 1}</td>
                    <td style="padding: 10px; font-weight: bold; color: #333;">${brand}</td>
                    <td style="padding: 10px; font-weight: bold;">${prodName}</td>
                    <td style="padding: 10px;">${item.spec || '-'}</td>
                    <td style="padding: 10px; text-align: center;">${item.unit || 'ea'}</td>
                    <td style="padding: 10px; text-align: right; font-weight: bold; color: #0B3C5D;">${Number(item.qty || item.quantity || 1)}</td>
                    <td style="padding: 10px; color: #666;">-</td>
                  </tr>
                `;
            }).join('');

            const localHtml = `
              <!DOCTYPE html>
              <html>
              <head>
                <meta charset="utf-8">
                <title>올빌드 현장 자재 주문요청서 - 자동 보관 사본</title>
                <style>
                  body { font-family: sans-serif; padding: 20px; color: #333; }
                  .header { border-bottom: 3px solid #0B3C5D; padding-bottom: 10px; margin-bottom: 20px; }
                  .info-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
                  .info-table th, .info-table td { border: 1px solid #ddd; padding: 8px; font-size: 14px; }
                  .info-table th { background: #f4f4f4; text-align: left; width: 25%; }
                  .item-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                  .item-table th { background: #0B3C5D; color: white; padding: 12px 10px; font-size: 14px; text-align: left; }
                  .footer { margin-top: 40px; font-size: 12px; color: #777; text-align: center; }
                </style>
              </head>
              <body>
                <div class="header">
                  <h2 style="color: #0B3C5D; margin: 0;">🏗️ 올빌드 자재주문요청서 (로컬 보관용)</h2>
                  <p style="margin: 5px 0 0 0; font-size: 12px; color: #666;">접수 일시: ${new Date().toLocaleString()}</p>
                </div>
                <h3>📌 상신 현장 및 신청 정보</h3>
                <table class="info-table">
                  <tr><th>현장명</th><td>${site}</td></tr>
                  <tr><th>신청자</th><td>${worker}</td></tr>
                  <tr><th>연락처 / 이메일</th><td>${tel} / ${mail}</td></tr>
                  <tr><th>현장 배송주소</th><td>${addr}</td></tr>
                </table>
                <h3>📦 신청 자재 목록</h3>
                <table class="item-table">
                  <thead>
                    <tr>
                      <th style="width: 8%; text-align: center;">번호</th>
                      <th style="width: 17%;">제조사</th>
                      <th style="width: 25%;">품명</th>
                      <th style="width: 15%;">규격(전압)</th>
                      <th style="width: 10%; text-align: center;">단위</th>
                      <th style="width: 10%; text-align: right;">수량</th>
                      <th>비고</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${itemRows}
                  </tbody>
                </table>
                <div class="footer">
                  <p>본 파일은 올빌드 MRO 시스템에 의해 로컬 문서 폴더로 자동 백업된 거래 사본입니다.</p>
                  <p>© 2026 ALLBUILD PROCUREMENT SYSTEM</p>
                </div>
              </body>
              </html>
            `;

            fs.writeFileSync(path.join(orderDir, filename), localHtml, 'utf8');
            console.log(`[로컬 백업] 현장자재요청서가 성공적으로 로컬 PC에 백업되었습니다: ${filename}`);
        } catch (localErr) {
            console.warn('[로컬 백업 경고] 현장자재요청서 로컬 PC 저장 중 오류 발생:', localErr);
        }

        let emailStatus = 'SUCCESS';
        let emailErrorDetail = null;

        // [신규 추가] 본사 관리자(allbuild.order@gmail.com) 및 현장 신청자 이메일로 요청서 HTML 자동 발송
        try {
            const emailUser = process.env.EMAIL_USER;
            const emailPass = process.env.EMAIL_PASS;

            if (emailUser && emailPass) {
                const dns = require('dns');
                const transporter = nodemailer.createTransport({
                    host: 'smtp.gmail.com',
                    port: 587,
                    secure: false, // 587 포트 사용 시 false (STARTTLS로 자동 업그레이드됨)
                    auth: {
                        user: emailUser,
                        pass: emailPass
                    },
                    lookup: (hostname, options, callback) => {
                        return dns.lookup(hostname, { family: 4 }, callback);
                    }
                });

                // 수신자 리스트 구성 (본사 메일 allbuild.order@gmail.com 강제 고정, 신청자 메일이 있으면 동시 전송)
                const recipientList = ['allbuild.order@gmail.com'];
                if (mail && mail.includes('@') && mail !== 'allbuild.order@gmail.com') {
                    recipientList.push(mail);
                }

                const mailOptions = {
                    from: `"올빌드 현장 주문 알림" <${emailUser}>`,
                    to: recipientList.join(', '),
                    subject: `[올빌드 자재요청] ${site} 현장의 주문요청서가 접수되었습니다. (${worker})`,
                    html: localHtml // 로컬 저장용 양식과 100% 동일한 HTML 양식 사용
                };

                const mailInfo = await transporter.sendMail(mailOptions);
                console.log(`[알림 메일 발송 성공] MessageID: ${mailInfo.messageId}, 수신처: ${recipientList.join(', ')}`);
            } else {
                console.warn('[알림 메일 경고] EMAIL_USER 또는 EMAIL_PASS 환경변수가 누락되어 알림 메일을 전송하지 못했습니다.');
                emailStatus = 'FAILED';
                emailErrorDetail = '이메일 발송용 환경변수 누락';
            }
        } catch (emailErr) {
            console.error('[알림 메일 오류] 현장 주문 알림 메일 전송 실패:', emailErr);
            emailStatus = 'FAILED';
            emailErrorDetail = emailErr.message || '알 수 없는 SMTP 연결 에러';
            // 이메일 발송이 실패하더라도 이미 DB 저장은 성공하였으므로 사용자 응답은 에러를 처리하지 않고 흘려보냅니다.
        }

        generateAllReports().catch(err => console.error('[보고서 생성 실패]:', err));

    } catch (err) {
        console.error('[API 처리 실패] 현장 주문 접수 중 오류:', err);
        return res.status(500).send(`<h2>[서버 오류] 주문 처리 중 에러가 발생했습니다: ${err.message || err}</h2>`);
    }

    // [수정] 클라이언트에서 AJAX fetch로 요청한 경우 JSON 응답을, 동기 Form Submit으로 요청한 경우 리다이렉트 기능이 탑재된 HTML 뷰를 제공합니다.
    if (isFetch === 'true') {
        return res.json({
            success: true,
            message: emailStatus === 'SUCCESS'
                ? `🎉 [전송 성공] 자재주문서가 본사 데이터베이스로 정상 전송되었으며, 알림 메일이 발송되었습니다!`
                : `⚠️ [접수 성공 단, 메일 발송 실패]\n주문서 접수는 정상 완료되었으나 알림 메일 발송은 실패했습니다.\n(원인: ${emailErrorDetail})`,
            count: parsedItems.length
        });
    } else {
        // 동기 제출을 한 클라이언트를 위한 예쁜 성공 HTML 리포트 화면 및 3초 후 자동 리다이렉트
        // 전달받은 returnUrl이 있으면 해당 주소(로컬 파일 등)로, 없으면 기본 홈페이지로 설정합니다.
        const redirectUrl = req.body.returnUrl || 'https://www.allbuild.co.kr';
        const msg = emailStatus === 'SUCCESS'
            ? `본사 DB 전송 완료 및 알림 이메일(${mail !== '이메일미기재' ? mail + ', ' : ''}allbuild.order@gmail.com) 발송이 성공적으로 처리되었습니다.`
            : `본사 DB 전송은 완료되었으나 알림 이메일 발송 과정에서 오류가 발생했습니다. (사유: ${emailErrorDetail || 'SMTP 연결 에러'})`;
            
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.send(`
          <!DOCTYPE html>
          <html lang="ko">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=device-width, initial-scale=1.0">
            <title>자재 주문 접수 완료 - 올빌드</title>
            <style>
              body {
                font-family: 'Malgun Gothic', sans-serif;
                background-color: #f8fafc;
                display: flex;
                align-items: center;
                justify-content: center;
                min-height: 100vh;
                margin: 0;
                color: #1e293b;
              }
              .success-card {
                background: #ffffff;
                padding: 40px 30px;
                border-radius: 24px;
                box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
                text-align: center;
                max-width: 450px;
                width: 90%;
                border: 1px solid #e2e8f0;
              }
              .icon-circle {
                width: 72px;
                height: 72px;
                background-color: #ecfdf5;
                color: #10b981;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 32px;
                margin: 0 auto 24px auto;
                border: 2px solid #a7f3d0;
              }
              h1 {
                font-size: 1.6rem;
                font-weight: 800;
                color: #0f172a;
                margin: 0 0 12px 0;
              }
              p.status-msg {
                font-size: 0.95rem;
                line-height: 1.6;
                color: #475569;
                margin: 0 0 28px 0;
                word-break: keep-all;
              }
              .redirect-info {
                font-size: 0.8rem;
                color: #94a3b8;
                margin-top: 20px;
              }
              .btn-home {
                display: inline-block;
                background-color: #0b3c5d;
                color: #ffffff;
                text-decoration: none;
                padding: 14px 28px;
                border-radius: 12px;
                font-weight: bold;
                font-size: 0.95rem;
                transition: all 0.2s;
                border: none;
                cursor: pointer;
                box-shadow: 0 4px 12px rgba(11, 60, 93, 0.2);
              }
              .btn-home:hover {
                background-color: #072b43;
                transform: translateY(-1px);
              }
            </style>
            <script>
              setTimeout(function() {
                window.location.href = "${redirectUrl}";
              }, 3000);
            </script>
          </head>
          <body>
            <div class="success-card">
              <div class="icon-circle">✓</div>
              <h1>자재 주문 요청 완료</h1>
              <p class="status-msg">${msg}</p>
              <a href="${redirectUrl}" class="btn-home">즉시 이전 화면으로 이동</a>
              <div class="redirect-info">
                ⏰ <span id="timer">3</span>초 후 이전 화면으로 자동 이동합니다.
              </div>
            </div>
            <script>
              var count = 3;
              var timerEl = document.getElementById('timer');
              setInterval(function() {
                if (count > 0) {
                  count--;
                  timerEl.innerText = count;
                }
              }, 1000);
            </script>
          </body>
          </html>
        `);
    }
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
        const dns = require('dns');
        const transporter = nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: 587,
            secure: false, // 587 포트 사용 시 false (STARTTLS로 자동 업그레이드됨)
            auth: {
                user: emailUser,
                pass: emailPass
            },
            lookup: (hostname, options, callback) => {
                return dns.lookup(hostname, { family: 4 }, callback);
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

/**
 * [POST] /api/estimate/save-local
 * 견적서 HTML 문서를 지정된 로컬 PC 문서 폴더에 자동 백업 저장합니다.
 */
router.post('/estimate/save-local', async (req, res) => {
    const { clientName, htmlContent } = req.body;
    
    if (!htmlContent) {
        return res.status(400).json({ error: '견적서 내용(htmlContent)이 누락되었습니다.' });
    }

    try {
        const os = require('os');
        const baseDir = path.join(os.homedir(), 'Documents/올빌드/올빌드거래자료');
        const estimateDir = path.join(baseDir, '견적서');
        
        if (!fs.existsSync(estimateDir)) {
            fs.mkdirSync(estimateDir, { recursive: true });
        }

        const dateStr = new Date().toISOString().split('T')[0];
        const timeStr = new Date().toTimeString().split(' ')[0].replace(/:/g, '-');
        const cleanClientName = (clientName || '귀하').trim().replace(/[\/\\:\*\?"<>\|]/g, '_');
        const filename = `올빌드_견적서_${cleanClientName}_${dateStr}_${timeStr}.html`;

        const fullHtml = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <title>올빌드 견적서 - 로컬 자동 보관 사본</title>
            <style>
              body { font-family: sans-serif; padding: 20px; background-color: #f3f4f6; }
              .print-area { background: white; padding: 40px; max-width: 800px; margin: 0 auto; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); border-radius: 8px; }
            </style>
          </head>
          <body>
            <div class="print-area">
              ${htmlContent}
            </div>
          </body>
          </html>
        `;

        fs.writeFileSync(path.join(estimateDir, filename), fullHtml, 'utf8');
        console.log(`[로컬 백업] 견적서가 성공적으로 로컬 PC에 백업되었습니다: ${filename}`);

        return res.json({ 
            success: true, 
            message: `견적서가 로컬 PC 폴더에 안전하게 보관되었습니다.\n(파일명: ${filename})` 
        });
    } catch (error) {
        console.error('[API 에러] 견적서 로컬 저장 오류:', error);
        return res.status(500).json({ error: `견적서를 로컬 PC에 보관하는 중 오류가 발생했습니다: ${error.message}` });
    }
});

module.exports = router;

