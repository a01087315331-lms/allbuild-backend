-- 004_create_business_info_table.sql
-- 사업자 정보를 저장하기 위한 테이블 생성

-- 1. 테이블 생성
CREATE TABLE IF NOT EXISTS public.business_info (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- 고유 식별자
    business_name TEXT NOT NULL,                  -- 암호화된 상호명
    business_number TEXT NOT NULL,                -- 암호화된 사업자번호
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. 보안 설정 (Row Level Security) - 현재는 단순화를 위해 비활성화하거나 관리자 권한만 허용 가능
-- 실제 서비스에서는 유저 ID별로 데이터를 나누어야 하지만, 현재는 단일 사업자 관리용으로 설계합니다.
ALTER TABLE public.business_info ENABLE ROW LEVEL SECURITY;

-- 모든 사용자(익명 포함)가 읽고 쓸 수 있도록 정책 설정 (개발용)
-- [주의] 실제 운영 시에는 인증된 사용자만 접근 가능하도록 수정해야 합니다.
CREATE POLICY "Allow public read and write for business_info" ON public.business_info
    FOR ALL USING (true) WITH CHECK (true);

-- 3. 설명 추가
COMMENT ON TABLE public.business_info IS '사용자의 암호화된 사업자 정보를 저장하는 테이블입니다.';
