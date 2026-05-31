const { supabase } = require('./utils/supabaseClient');

async function testConnection() {
    try {
        console.log('Supabase 연결 상태 테스트 시작...');
        const { data, error } = await supabase
            .from('orders')
            .select('*')
            .limit(1);

        if (error) {
            console.error('DB 쿼리 중 에러 발생:', error.message);
        } else {
            console.log('연결 성공! 가져온 데이터 샘플:', data);
            if (data && data.length > 0) {
                console.log('존재하는 컬럼 목록:', Object.keys(data[0]));
            } else {
                console.log('테이블이 비어있어 컬럼 구조를 확인하려면 더미 인서트 테스트가 필요합니다.');
            }
        }
    } catch (err) {
        console.error('연결 실패:', err);
    }
}

testConnection();
