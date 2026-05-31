-- 001_create_products_search_table.sql
-- 검색 결과 캐싱 테이블 생성 (가격 비교용)

CREATE TABLE IF NOT EXISTS public.products_search (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    search_keyword VARCHAR(255) NOT NULL, -- 검색한 스펙/키워드
    mall_name VARCHAR(100) NOT NULL, -- 쇼핑몰 이름 (예: 쿠팡, 11번가 등)
    product_name VARCHAR(500) NOT NULL, -- 상품명
    price NUMERIC(10, 2) NOT NULL, -- 가격
    tax NUMERIC(10, 2) NOT NULL, -- 부가세 (보통 가격의 10%)
    total_price NUMERIC(10, 2) NOT NULL, -- 총합 (가격 + 부가세)
    shipping_days INTEGER, -- 예상 배송 소요일수
    product_url TEXT, -- 상품 링크
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 검색 키워드 및 쇼핑몰 기준 인덱스 (빠른 검색을 위해)
CREATE INDEX IF NOT EXISTS idx_products_search_keyword ON public.products_search (search_keyword);
CREATE INDEX IF NOT EXISTS idx_products_search_mall ON public.products_search (mall_name);

-- 한국어 설명 주석:
-- 이 테이블은 사용자가 입력한 상품 스펙을 검색한 결과를 캐싱(저장)하여
-- 나중에 엑셀 형태로 다시 불러올 때 활용됩니다.
