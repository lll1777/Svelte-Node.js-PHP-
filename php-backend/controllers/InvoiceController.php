<?php
class InvoiceController {
    private $db;
    
    public function __construct($db) {
        $this->db = $db;
    }
    
    public function getAll($params = []) {
        $sql = "SELECT i.*, o.order_number, o.guest_name, o.total_amount as order_amount
                FROM invoices i
                LEFT JOIN orders o ON i.order_id = o.id
                WHERE 1=1";
        $bindParams = [];
        
        if (isset($params['status']) && $params['status']) {
            $sql .= " AND i.status = ?";
            $bindParams[] = $params['status'];
        }
        
        if (isset($params['orderId']) && $params['orderId']) {
            $sql .= " AND i.order_id = ?";
            $bindParams[] = $params['orderId'];
        }
        
        if (isset($params['invoiceType']) && $params['invoiceType']) {
            $sql .= " AND i.invoice_type = ?";
            $bindParams[] = $params['invoiceType'];
        }
        
        $sql .= " ORDER BY i.created_at DESC";
        
        $invoices = $this->db->fetchAll($sql, $bindParams);
        
        return [
            'success' => true,
            'data' => array_map([$this, 'formatInvoice'], $invoices)
        ];
    }
    
    public function getById($invoiceId) {
        $sql = "SELECT i.*, o.order_number, o.guest_name, o.total_amount as order_amount
                FROM invoices i
                LEFT JOIN orders o ON i.order_id = o.id
                WHERE i.id = ?";
        $invoice = $this->db->fetchOne($sql, [$invoiceId]);
        
        if (!$invoice) {
            return ['success' => false, 'error' => '发票不存在'];
        }
        
        return [
            'success' => true,
            'data' => $this->formatInvoice($invoice)
        ];
    }
    
    public function create($data) {
        $orderId = $data['orderId'] ?? null;
        $amount = $data['amount'] ?? 0;
        $invoiceType = $data['invoiceType'] ?? 'personal';
        $title = $data['title'] ?? null;
        $taxNumber = $data['taxNumber'] ?? null;
        $address = $data['address'] ?? null;
        $phone = $data['phone'] ?? null;
        $bankName = $data['bankName'] ?? null;
        $bankAccount = $data['bankAccount'] ?? null;
        
        if (!$orderId || !$title) {
            return ['success' => false, 'error' => '订单ID和发票抬头不能为空'];
        }
        
        $invoiceNumber = $this->generateInvoiceNumber();
        
        try {
            $this->db->beginTransaction();
            
            $sql = "INSERT INTO invoices 
                    (invoice_number, order_id, amount, invoice_type, title, tax_number, 
                     address, phone, bank_name, bank_account, status, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'))";
            
            $result = $this->db->execute($sql, [
                $invoiceNumber, $orderId, $amount, $invoiceType, $title, $taxNumber,
                $address, $phone, $bankName, $bankAccount
            ]);
            
            if (!$result['lastInsertId']) {
                $this->db->rollBack();
                return ['success' => false, 'error' => '创建发票失败'];
            }
            
            $this->db->commit();
            return $this->getById($result['lastInsertId']);
            
        } catch (Exception $e) {
            $this->db->rollBack();
            return ['success' => false, 'error' => '创建发票失败: ' . $e->getMessage()];
        }
    }
    
    public function updateStatus($invoiceId, $data) {
        $status = $data['status'] ?? null;
        
        if (!$status) {
            return ['success' => false, 'error' => '状态不能为空'];
        }
        
        $validStatuses = ['pending', 'issued', 'voided'];
        if (!in_array($status, $validStatuses)) {
            return ['success' => false, 'error' => '无效的状态值'];
        }
        
        $currentInvoice = $this->db->fetchOne(
            "SELECT * FROM invoices WHERE id = ?", 
            [$invoiceId]
        );
        
        if (!$currentInvoice) {
            return ['success' => false, 'error' => '发票不存在'];
        }
        
        $updates = ['status = ?'];
        $params = [$status];
        
        if ($status === 'issued') {
            $updates[] = "issued_at = datetime('now')";
        } elseif ($status === 'voided') {
            $updates[] = "voided_at = datetime('now')";
            if (isset($data['voidReason'])) {
                $updates[] = "void_reason = ?";
                $params[] = $data['voidReason'];
            }
        }
        
        $sql = "UPDATE invoices SET " . implode(', ', $updates) . " WHERE id = ?";
        $params[] = $invoiceId;
        
        $this->db->execute($sql, $params);
        
        return $this->getById($invoiceId);
    }
    
    private function generateInvoiceNumber() {
        $date = date('Ymd');
        $random = strtoupper(substr(md5(uniqid()), 0, 6));
        return 'INV' . $date . $random;
    }
    
    private function formatInvoice($invoice) {
        if (!$invoice) return null;
        
        return [
            'id' => (int)$invoice['id'],
            'invoiceNumber' => $invoice['invoice_number'],
            'orderId' => (int)$invoice['order_id'],
            'orderNumber' => $invoice['order_number'] ?? null,
            'guestName' => $invoice['guest_name'] ?? null,
            'amount' => (float)$invoice['amount'],
            'orderAmount' => isset($invoice['order_amount']) ? (float)$invoice['order_amount'] : null,
            'invoiceType' => $invoice['invoice_type'],
            'title' => $invoice['title'],
            'taxNumber' => $invoice['tax_number'] ?? null,
            'address' => $invoice['address'] ?? null,
            'phone' => $invoice['phone'] ?? null,
            'bankName' => $invoice['bank_name'] ?? null,
            'bankAccount' => $invoice['bank_account'] ?? null,
            'status' => $invoice['status'],
            'issuedAt' => $invoice['issued_at'] ?? null,
            'voidedAt' => $invoice['voided_at'] ?? null,
            'voidReason' => $invoice['void_reason'] ?? null,
            'createdAt' => $invoice['created_at'] ?? null
        ];
    }
}
