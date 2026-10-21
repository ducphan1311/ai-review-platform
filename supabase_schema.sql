-- SQL Schema khởi tạo cho Supabase Project: <your-project-ref>
-- Chạy đoạn script này tại: https://supabase.com/dashboard

-- 1. Bảng tiếp nhận đăng ký License từ Landing Page
CREATE TABLE IF NOT EXISTS public.license_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT now(),
    company_name TEXT NOT NULL,
    contact_name TEXT NOT NULL,
    email TEXT NOT NULL,
    plan TEXT DEFAULT 'trial',
    machine_id TEXT,
    notes TEXT,
    status TEXT DEFAULT 'pending'
);

-- 2. Bảng lưu trữ License đã cấp
CREATE TABLE IF NOT EXISTS public.licenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT now(),
    request_id UUID REFERENCES public.license_requests(id) ON DELETE SET NULL,
    customer_name TEXT NOT NULL,
    license_key TEXT NOT NULL,
    valid_until TIMESTAMPTZ NOT NULL,
    max_repos INT DEFAULT 10,
    machine_id TEXT,
    is_active BOOLEAN DEFAULT true
);

-- 3. Bật RLS (Row Level Security)
ALTER TABLE public.license_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;

-- 4. Tạo Policy cho phép form public gửi đăng ký và đọc
CREATE POLICY "Allow public insert to license_requests" 
ON public.license_requests FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Allow public read to license_requests" 
ON public.license_requests FOR SELECT 
USING (true);

CREATE POLICY "Allow all access to licenses" 
ON public.licenses FOR ALL 
USING (true);
