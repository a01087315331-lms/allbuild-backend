require('dotenv').config();
const { supabase } = require('./utils/supabaseClient');
const { hashPassword } = require('./utils/auth');

async function forceReset() {
  try {
    console.log('🔄 비밀번호 일괄 강제 세팅 시작...');
    
    // 1. 본사 최고 관리자 비밀번호 세팅 (allbuild1234)
    const adminPass = 'allbuild1234';
    const adminHash = await hashPassword(adminPass);
    console.log('👑 본사 암호 해싱 완료.');

    // 2. 현장 자재 담당자 비밀번호 세팅 (1234)
    const sitePass = '1234';
    const siteHash = await hashPassword(sitePass);
    console.log('👷 현장 암호 해싱 완료.');

    // DB 업데이트 - allbuild
    const { error: adminErr } = await supabase
      .from('member_accounts')
      .update({ password_hash: adminHash })
      .eq('username', 'allbuild');
      
    if (adminErr) throw adminErr;
    console.log('👑 본사(allbuild) 비밀번호 "allbuild1234"로 강제 세팅 완료!');

    // DB 업데이트 - site
    const { error: siteErr } = await supabase
      .from('member_accounts')
      .update({ password_hash: siteHash })
      .eq('username', 'site');
      
    if (siteErr) throw siteErr;
    console.log('👷 현장(site) 비밀번호 "1234"로 강제 세팅 완료!');

    console.log('🎉 모든 비밀번호 초기화 성공!');
  } catch (err) {
    console.error('❌ 강제 초기화 중 에러 발생:', err.message);
  }
}

forceReset();
