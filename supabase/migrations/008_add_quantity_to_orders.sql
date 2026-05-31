-- 008_add_quantity_to_orders.sql
-- orders 테이블에 수량(quantity) 컬럼 추가 및 주석 갱신

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 1;

COMMENT ON COLUMN public.orders.quantity IS '발주 및 주문 수량';
