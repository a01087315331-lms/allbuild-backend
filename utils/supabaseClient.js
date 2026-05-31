// server/utils/supabaseClient.js
// Supabase 데이터베이스 연결을 위한 클라이언트 설정 파일

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// 환경변수에서 Supabase 접속 정보를 가져옵니다.
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

// 접속 정보가 없는 경우 경고 메시지를 출력합니다.
if (!supabaseUrl || !supabaseKey) {
    console.warn('[경고] SUPABASE_URL 또는 SUPABASE_KEY가 .env 파일에 설정되지 않았습니다.');
    console.warn('데이터베이스 연동 기능이 정상적으로 작동하지 않을 수 있습니다.');
}

// Supabase 클라이언트 객체 생성 및 내보내기
const supabase = createClient(supabaseUrl || '', supabaseKey || '');

module.exports = { supabase };
