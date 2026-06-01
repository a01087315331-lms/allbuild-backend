// server/run_migration_009.js
const { supabase } = require('./utils/supabaseClient');
const fs = require('fs');
const path = require('path');

async function run() {
    console.log('009 마이그레이션 SQL 로드 중...');
    const sqlPath = path.join(__dirname, 'supabase/migrations/009_create_system_config.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    try {
        console.log('Supabase exec_sql RPC 호출 중...');
        const { data, error } = await supabase.rpc('exec_sql', { sql });
        if (error) {
            console.error('마이그레이션 실행 에러:', error.message);
        } else {
            console.log('마이그레이션 성공! 결과:', data);
        }
    } catch(err) {
        console.error('예외 발생:', err);
    }
}

run();
