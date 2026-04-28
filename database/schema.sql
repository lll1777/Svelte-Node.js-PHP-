-- 酒店PMS系统数据库初始化脚本
-- SQLite 3

-- 房间表
CREATE TABLE IF NOT EXISTS rooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_number VARCHAR(10) NOT NULL UNIQUE,
    type VARCHAR(50) NOT NULL,
    floor INTEGER NOT NULL,
    price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    max_guests INTEGER NOT NULL DEFAULT 2,
    status VARCHAR(20) NOT NULL DEFAULT 'available', -- available, occupied, cleaning, maintenance
    amenities TEXT, -- JSON格式存储设施
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 订单表
CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_number VARCHAR(20) NOT NULL UNIQUE,
    room_id INTEGER NOT NULL,
    guest_name VARCHAR(100) NOT NULL,
    guest_phone VARCHAR(20) NOT NULL,
    guest_id_card VARCHAR(20),
    check_in_date DATE NOT NULL,
    check_out_date DATE NOT NULL,
    actual_check_in_time TIMESTAMP,
    actual_check_out_time TIMESTAMP,
    guest_count INTEGER NOT NULL DEFAULT 1,
    special_requests TEXT,
    total_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    paid_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    refund_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, paid, checked_in, checked_out, cancelled, refunded
    source VARCHAR(20) DEFAULT 'direct', -- direct, online, third_party
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (room_id) REFERENCES rooms(id)
);

-- 订单状态历史表
CREATE TABLE IF NOT EXISTS order_status_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    old_status VARCHAR(20),
    new_status VARCHAR(20) NOT NULL,
    changed_by VARCHAR(50) DEFAULT 'system',
    remark TEXT,
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id)
);

-- 支付记录表
CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    payment_number VARCHAR(20) NOT NULL UNIQUE,
    order_id INTEGER NOT NULL,
    amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    payment_method VARCHAR(20) NOT NULL, -- wechat, alipay, cash, card, transfer
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, completed, failed, refunded
    transaction_id VARCHAR(100), -- 第三方支付交易号
    paid_at TIMESTAMP,
    refunded_at TIMESTAMP,
    refund_reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id)
);

-- 换房记录表
CREATE TABLE IF NOT EXISTS room_changes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    old_room_id INTEGER NOT NULL,
    new_room_id INTEGER NOT NULL,
    change_reason TEXT,
    price_adjustment DECIMAL(10, 2) DEFAULT 0.00,
    changed_by VARCHAR(50) DEFAULT 'system',
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (old_room_id) REFERENCES rooms(id),
    FOREIGN KEY (new_room_id) REFERENCES rooms(id)
);

-- 房间锁定表（用于防止重复预订）
CREATE TABLE IF NOT EXISTS room_locks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id INTEGER NOT NULL,
    order_id INTEGER,
    lock_type VARCHAR(20) NOT NULL, -- booking, maintenance, temp
    lock_reason TEXT,
    locked_by VARCHAR(50) DEFAULT 'system',
    locked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    is_active BOOLEAN DEFAULT 1,
    FOREIGN KEY (room_id) REFERENCES rooms(id),
    FOREIGN KEY (order_id) REFERENCES orders(id)
);

-- 清洁计划表
CREATE TABLE IF NOT EXISTS cleaning_schedule (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id INTEGER NOT NULL,
    order_id INTEGER,
    schedule_date DATE NOT NULL,
    priority VARCHAR(10) DEFAULT 'normal', -- urgent, normal, low
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, in_progress, completed, cancelled
    assigned_to VARCHAR(50),
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    remarks TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (room_id) REFERENCES rooms(id),
    FOREIGN KEY (order_id) REFERENCES orders(id)
);

-- 发票表
CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_number VARCHAR(30) NOT NULL UNIQUE,
    order_id INTEGER NOT NULL,
    amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    invoice_type VARCHAR(20) NOT NULL, -- personal, company
    title VARCHAR(100) NOT NULL,
    tax_number VARCHAR(30),
    address TEXT,
    phone VARCHAR(20),
    bank_name VARCHAR(100),
    bank_account VARCHAR(50),
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, issued, voided
    issued_at TIMESTAMP,
    voided_at TIMESTAMP,
    void_reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id)
);

-- 营收报表记录表（用于快速查询）
CREATE TABLE IF NOT EXISTS revenue_summary (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    summary_date DATE NOT NULL UNIQUE,
    total_orders INTEGER DEFAULT 0,
    total_revenue DECIMAL(10, 2) DEFAULT 0.00,
    room_revenue DECIMAL(10, 2) DEFAULT 0.00,
    other_revenue DECIMAL(10, 2) DEFAULT 0.00,
    total_payments DECIMAL(10, 2) DEFAULT 0.00,
    total_refunds DECIMAL(10, 2) DEFAULT 0.00,
    check_ins INTEGER DEFAULT 0,
    check_outs INTEGER DEFAULT 0,
    occupancy_rate DECIMAL(5, 2) DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_orders_room_id ON orders(room_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_check_in ON orders(check_in_date);
CREATE INDEX IF NOT EXISTS idx_orders_check_out ON orders(check_out_date);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);

CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

CREATE INDEX IF NOT EXISTS idx_room_locks_room_id ON room_locks(room_id);
CREATE INDEX IF NOT EXISTS idx_room_locks_active ON room_locks(is_active);

CREATE INDEX IF NOT EXISTS idx_cleaning_room_id ON cleaning_schedule(room_id);
CREATE INDEX IF NOT EXISTS idx_cleaning_status ON cleaning_schedule(status);
CREATE INDEX IF NOT EXISTS idx_cleaning_date ON cleaning_schedule(schedule_date);

CREATE INDEX IF NOT EXISTS idx_invoices_order_id ON invoices(order_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);

CREATE INDEX IF NOT EXISTS idx_revenue_date ON revenue_summary(summary_date);

-- 插入测试数据：房间
INSERT OR IGNORE INTO rooms (room_number, type, floor, price, max_guests, status, amenities, description) VALUES
('101', '标准间', 1, 198.00, 2, 'available', '["空调","电视","独立卫浴","WiFi","热水壶"]', '宽敞舒适的标准间，配备基本设施'),
('102', '标准间', 1, 198.00, 2, 'available', '["空调","电视","独立卫浴","WiFi","热水壶"]', '宽敞舒适的标准间，配备基本设施'),
('103', '大床房', 1, 258.00, 2, 'available', '["空调","电视","独立卫浴","WiFi","热水壶","迷你吧"]', '温馨大床房，适合情侣入住'),
('201', '商务间', 2, 298.00, 2, 'available', '["空调","电视","独立卫浴","WiFi","热水壶","迷你吧","办公桌","保险箱"]', '商务客房，配备办公设施'),
('202', '商务间', 2, 298.00, 2, 'available', '["空调","电视","独立卫浴","WiFi","热水壶","迷你吧","办公桌","保险箱"]', '商务客房，配备办公设施'),
('203', '豪华大床房', 2, 388.00, 2, 'available', '["空调","电视","独立卫浴","WiFi","热水壶","迷你吧","浴缸","浴袍"]', '豪华大床房，享受舒适体验'),
('301', '套房', 3, 588.00, 3, 'available', '["空调","电视","独立卫浴","WiFi","热水壶","迷你吧","浴缸","浴袍","客厅","厨房"]', '豪华套房，空间宽敞舒适'),
('302', '总统套房', 3, 1288.00, 4, 'available', '["空调","电视","独立卫浴","WiFi","热水壶","迷你吧","浴缸","浴袍","客厅","厨房","书房","会客厅"]', '顶级总统套房，尊享奢华体验');
