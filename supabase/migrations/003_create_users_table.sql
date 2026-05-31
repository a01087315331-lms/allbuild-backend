-- 003_create_users_table.sql
-- 관리자 및 담당자 테이블 생성 (암호화 필수)

CREATE TABLE IF NOT EXISTS public.users (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL, -- 로그인 아이디
    password_hash TEXT NOT NULL, -- 암호화된(Hashed) 비밀번호
    real_name_encrypted TEXT NOT NULL, -- 암호화된 실제 이름 (AES 등 활용 예정)
    role VARCHAR(50) DEFAULT 'BUYER', -- 역할 (ADMIN: 최고관리자, BUYER: 구매담당자, APPROVER: 승인권자)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 한국어 설명 주석:
-- 올빌드 구매 담당자 및 시스템 이용자들의 정보를 안전하게 관리하기 위한 테이블입니다.
-- 보안 규칙에 따라 실명과 같은 민감 정보는 백엔드에서 암호화되어(real_name_encrypted) 저장됩니다.
