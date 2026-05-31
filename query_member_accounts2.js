require('dotenv').config();
const { supabase } = require('./utils/supabaseClient');

async function checkAccounts() {
  try {
    console.log('member_accounts 테이블 데이터 조회 중...');
    const { data, error } = await supabase
      .from('member_accounts')
      .select('id, username, password_hash, role, created_at');

    if (error) {
      console.error('❌ 조회 실패:', error.message);
    } else {
      console.log('✅ 조회 성공! 가입된 계정 목록:');
      console.log(data);
    }
  } catch (err) {
    console.error('시스템 에러:', err.message);
  }
}

checkAccounts();
