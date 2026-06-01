-- supabase/migrations/009_create_system_config.sql
-- 시스템 보안 설정 및 공통 환경 변수 보관을 위한 테이블 정의

CREATE TABLE IF NOT EXISTS system_config (
    key VARCHAR(255) PRIMARY KEY,
    value TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- RLS 보안 강화 설정
ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;

-- 모든 사용자 조회 차단 (익명 및 인증 계정 전체 읽기 방지, 오직 서비스 롤만 접근 허용)
CREATE POLICY "service_role_all_access" ON system_config
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
