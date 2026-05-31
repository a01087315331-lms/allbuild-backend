-- 006_create_member_accounts_table.sql
-- member_accounts 테이블 생성 및 orders 테이블 스키마 확장 (현장명 및 영수증 증빙용)

-- 1. 사용자 계정 관리 테이블 생성 (member_accounts)
-- users 테이블과 함께 계정 권한(ADMIN, SITE) 정보를 안전하게 관리하기 위해 생성합니다.
CREATE TABLE IF NOT EXISTS public.member_accounts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,               -- 로그인용 아이디 (예: allbuild, site1 등)
    password_hash TEXT NOT NULL,                         -- bcryptjs 등으로 암호화된 비밀번호 해시
    real_name_encrypted TEXT NOT NULL,                   -- AES 암호화된 사용자 실제 이름
    role VARCHAR(50) DEFAULT 'SITE' NOT NULL,            -- 역할 (ADMIN: 본사 관리자, SITE: 현장 담당자)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 한국어 설명 주석:
COMMENT ON TABLE public.member_accounts IS '올빌드 자재주문 및 MRO 시스템 이용자 계정 정보 테이블입니다.';
COMMENT ON COLUMN public.member_accounts.username IS '로그인 시 사용하는 유니크한 사용자 아이디';
COMMENT ON COLUMN public.member_accounts.password_hash IS '단방향 암호화 처리된 패스워드 해시값';
COMMENT ON COLUMN public.member_accounts.real_name_encrypted IS '보안 규정에 의거 양방향 암호화 처리된 실명 데이터';
COMMENT ON COLUMN public.member_accounts.role IS '계정의 권한 등급 (ADMIN: 본사 관리자, SITE: 현장 담당자)';

-- 2. orders 테이블에 현장명(site_name) 및 영수증 증빙 파일 경로(receipt_url) 컬럼 추가
-- 기존에 orders 테이블이 존재하므로 ALTER TABLE을 안전하게(IF NOT EXISTS 조건 활용) 적용합니다.
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS site_name TEXT,
ADD COLUMN IF NOT EXISTS receipt_url TEXT;

-- 한국어 설명 주석:
COMMENT ON COLUMN public.orders.site_name IS '자재를 주문한 현장명 (현장별 세무 결산 집계에 활용)';
COMMENT ON COLUMN public.orders.receipt_url IS '거래에 매칭된 매입 영수증/세금계산서의 이미지 저장 경로';
