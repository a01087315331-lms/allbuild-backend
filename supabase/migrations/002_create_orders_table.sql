-- 002_create_orders_table.sql
-- 발주 내역 관리 테이블 생성

CREATE TABLE IF NOT EXISTS public.orders (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    product_id UUID REFERENCES public.products_search(id), -- 검색된 상품 고유 ID 참조
    user_id UUID NOT NULL, -- 발주를 요청한 담당자 ID (users 테이블 참조 예정)
    quantity INTEGER NOT NULL DEFAULT 1, -- 수량
    order_status VARCHAR(50) DEFAULT 'PENDING', -- 발주 상태 (PENDING: 대기, APPROVED: 승인, COMPLETED: 완료)
    order_date TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL, -- 발주 일자
    expected_delivery_date TIMESTAMP WITH TIME ZONE, -- 예상 도착 일자
    memo TEXT, -- 발주 비고란
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 발주 날짜 기준 인덱스 (주간/월간/분기 통계용)
CREATE INDEX IF NOT EXISTS idx_orders_date ON public.orders (order_date);

-- 한국어 설명 주석:
-- 사용자가 엑셀에서 '발주' 체크 후 업로드했을 때,
-- 실제 시스템 상에 접수되는 발주서 내역을 담는 테이블입니다.
