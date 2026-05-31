-- 007_create_mall_credentials_table.sql
-- 쇼핑몰별 API 및 크롤러 연동 정보(아이디, 암호화 비밀번호) 테이블 생성

CREATE TABLE IF NOT EXISTS public.mall_credentials (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    mall_name VARCHAR(100) UNIQUE NOT NULL,               -- 쇼핑몰 이름 (예: 쿠팡, 11번가, 네이버 등)
    login_id VARCHAR(150) NOT NULL,                       -- 로그인 아이디
    login_pw_encrypted TEXT NOT NULL,                     -- 양방향 AES-256 암호화된 비밀번호
    status VARCHAR(50) DEFAULT 'ACTIVE' NOT NULL,         -- 연동 상태 (ACTIVE, INACTIVE, ERROR)
    last_checked_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 한국어 설명 주석:
COMMENT ON TABLE public.mall_credentials IS '올빌드에서 자동 연동할 쇼핑몰(MRO몰) 계정 정보를 안전하게 보관하는 테이블입니다.';
COMMENT ON COLUMN public.mall_credentials.mall_name IS '쇼핑몰 상호/이름 (쿠팡, 11번가 등)';
COMMENT ON COLUMN public.mall_credentials.login_id IS '해당 쇼핑몰 접속 로그인 아이디';
COMMENT ON COLUMN public.mall_credentials.login_pw_encrypted IS '보안 규격에 의거 양방향 암호화(AES-256) 처리된 쇼핑몰 접속 패스워드';
COMMENT ON COLUMN public.mall_credentials.status IS '현재 계정 연동 성공 상태 (ACTIVE: 정상, ERROR: 로그인실패 등)';
COMMENT ON COLUMN public.mall_credentials.last_checked_at IS '최종 연동 상태 확인 및 검증 시각';
