const { supabase } = require('./utils/supabaseClient');

async function tryMigration() {
    const migrationSql = `
        ALTER TABLE public.orders 
        ADD COLUMN IF NOT EXISTS site_name TEXT,
        ADD COLUMN IF NOT EXISTS receipt_url TEXT;
    `;

    try {
        console.log('exec_sql RPC 함수 실행 시도 중...');
        const { data, error } = await supabase.rpc('exec_sql', { sql: migrationSql });
        
        if (error) {
            console.error('RPC 실행 중 에러 발생:', error.message);
            console.log('이 Supabase 프로젝트에는 exec_sql RPC 함수가 정의되지 않았거나 권한이 없습니다.');
        } else {
            console.log('성공적으로 SQL이 실행되었습니다! 결과:', data);
        }
    } catch (err) {
        console.error('RPC 실행 에러:', err);
    }
}

tryMigration();
