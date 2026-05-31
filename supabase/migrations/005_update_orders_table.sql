-- 005_update_orders_table.sql
-- orders 테이블에 상세 구매 정보 및 매출(revenue) 컬럼 추가

-- 1. 기존 테이블 구조 변경 (기록 보존을 위해 컬럼 추가)
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS mall_name TEXT,
ADD COLUMN IF NOT EXISTS product_name TEXT,
ADD COLUMN IF NOT EXISTS price NUMERIC(15, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS tax NUMERIC(15, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_price NUMERIC(15, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS shipping_days INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS shipping_fee NUMERIC(15, 2) DEFAULT 0, -- 배송비 컬럼 추가
ADD COLUMN IF NOT EXISTS revenue NUMERIC(15, 2) DEFAULT 0; -- 매출액 컬럼 추가

-- 2. user_id 제약 조건 완화 (로그인 기능이 아직 완성되지 않았으므로 NULL 허용)
ALTER TABLE public.orders ALTER COLUMN user_id DROP NOT NULL;

-- 3. product_id 제약 조건 완화 (엑셀 업로드 시 직접 데이터를 넣기 위해)
ALTER TABLE public.orders ALTER COLUMN product_id DROP NOT NULL;

-- 4. 한국어 설명 주석 업데이트
COMMENT ON COLUMN public.orders.mall_name IS '구매한 쇼핑몰 이름';
COMMENT ON COLUMN public.orders.product_name IS '구매한 상품명';
COMMENT ON COLUMN public.orders.price IS '매입 공급가액';
COMMENT ON COLUMN public.orders.tax IS '매입 부가세';
COMMENT ON COLUMN public.orders.revenue IS '실제 판매한 매출액 (이익 계산용)';

-- 5. 통계 쿼리를 위한 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_orders_mall ON public.orders (mall_name);
