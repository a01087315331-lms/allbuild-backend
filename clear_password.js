// server/clear_password.js
// 본사 최고 관리자(allbuild)의 비밀번호를 안전하게 비워서 최초 설정 화면으로 되돌리는 스크립트입니다.
// 이 스크립트를 실행한 후, 웹 브라우저를 새로고침하면 비밀번호를 새로 등록할 수 있습니다.

const path = require('path');
// 동일 디렉토리 내의 supabaseClient 모듈을 가져옵니다.
const { supabase } = require('./utils/supabaseClient');

async function run() {
    console.log('[올빌드 시스템] 본사 최고 관리자(allbuild) 비밀번호 초기화를 시작합니다...');
    try {
        // 1. member_accounts 테이블에서 'allbuild' 계정을 검색합니다.
        const { data: existing, error: selectError } = await supabase
            .from('member_accounts')
            .select('*')
            .eq('username', 'allbuild')
            .maybeSingle();

        if (selectError) {
            console.error('❌ 데이터베이스에서 계정을 확인하는 중 오류가 발생했습니다:', selectError);
            return;
        }

        if (existing) {
            console.log(' - "allbuild" 계정이 감지되었습니다. 기존 비밀번호 해시값을 지우는 중...');
            
            // 2. password_hash 컬럼을 null로 변경하여 초기 설정(Setup Mode) 상태로 되돌립니다.
            const { error: updateError } = await supabase
                .from('member_accounts')
                .update({ password_hash: null })
                .eq('id', existing.id);
            
            if (updateError) {
                console.error('❌ 비밀번호 비우기 실패:', updateError);
            } else {
                console.log('================================================================');
                console.log('✅ 본사 최고 관리자(allbuild)의 비밀번호가 성공적으로 비워졌습니다!');
                console.log('👉 이제 웹 브라우저를 새로고침하시면 자동으로 [초기 비밀번호 설정] 화면이 나타납니다.');
                console.log('👉 거기서 원하시는 새 비밀번호를 바로 입력해 주시면 재설정이 완료됩니다.');
                console.log('================================================================');
            }
        } else {
            console.log('❌ "allbuild" 계정이 데이터베이스에 존재하지 않습니다. 먼저 서버를 구동해 데이터베이스 초기 연결이 완료되었는지 확인해 주세요.');
        }
    } catch (e) {
        console.error('❌ 시스템 내부 오류가 발생했습니다:', e);
    }
}

run();
