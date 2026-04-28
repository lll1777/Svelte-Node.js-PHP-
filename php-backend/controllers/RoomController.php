<?php
require_once __DIR__ . '/../config/stateMachine.php';

class RoomController {
    private $db;
    
    public function __construct($db) {
        $this->db = $db;
    }
    
    public function getAll($params = []) {
        $sql = "SELECT * FROM rooms WHERE 1=1";
        $bindParams = [];
        
        if (isset($params['status']) && !empty($params['status'])) {
            $sql .= " AND status = ?";
            $bindParams[] = $params['status'];
        }
        
        if (isset($params['floor']) && !empty($params['floor'])) {
            $sql .= " AND floor = ?";
            $bindParams[] = $params['floor'];
        }
        
        $sql .= " ORDER BY floor, room_number";
        
        $rooms = $this->db->fetchAll($sql, $bindParams);
        
        return [
            'success' => true,
            'data' => $this->formatRooms($rooms)
        ];
    }
    
    public function getById($roomId) {
        $sql = "SELECT * FROM rooms WHERE id = ?";
        $room = $this->db->fetchOne($sql, [$roomId]);
        
        if (!$room) {
            return ['success' => false, 'error' => '房间不存在', 'errorCode' => 'ROOM_NOT_FOUND'];
        }
        
        return [
            'success' => true,
            'data' => $this->formatRoom($room)
        ];
    }
    
    public function getAvailability($params = []) {
        $checkInDate = isset($params['checkInDate']) ? $params['checkInDate'] : date('Y-m-d');
        $checkOutDate = isset($params['checkOutDate']) ? $params['checkOutDate'] : date('Y-m-d', strtotime('+1 day'));
        $roomId = isset($params['roomId']) ? $params['roomId'] : null;
        
        $dateValidation = validateOrderDates($checkInDate, $checkOutDate);
        if (!$dateValidation['valid']) {
            return ['success' => false, 'error' => $dateValidation['reason'], 'errorCode' => 'INVALID_DATES'];
        }
        
        $availability = $this->checkRoomAvailabilityInternal($roomId, $checkInDate, $checkOutDate);
        
        return $availability;
    }
    
    private function checkRoomAvailabilityInternal($roomId, $checkInDate, $checkOutDate, $excludeOrderId = null) {
        $pdo = $this->db->getConnection();
        
        try {
            $pdo->exec('BEGIN DEFERRED TRANSACTION');
            
            if ($roomId) {
                $room = $this->db->fetchOne("SELECT * FROM rooms WHERE id = ?", [$roomId]);
                
                if (!$room) {
                    $pdo->rollBack();
                    return [
                        'success' => true,
                        'data' => [],
                        'available' => false
                    ];
                }
                
                if ($room['status'] === ROOM_STATUSES['MAINTENANCE']) {
                    $pdo->rollBack();
                    return [
                        'success' => true,
                        'data' => [],
                        'available' => false,
                        'error' => '房间正在维护中',
                        'errorCode' => 'ROOM_MAINTENANCE'
                    ];
                }
                
                if ($room['status'] === ROOM_STATUSES['OCCUPIED']) {
                    $occupiedOrder = $this->db->fetchOne(
                        "SELECT o.* FROM orders o
                         WHERE o.room_id = ? 
                           AND o.status = 'checked_in'
                         LIMIT 1",
                        [$roomId]
                    );
                    
                    if ($occupiedOrder) {
                        $occupiedCheckOut = DateTime::createFromFormat('Y-m-d', $occupiedOrder['check_out_date']);
                        $newCheckIn = DateTime::createFromFormat('Y-m-d', $checkInDate);
                        
                        if ($newCheckIn < $occupiedCheckOut) {
                            $pdo->rollBack();
                            return [
                                'success' => true,
                                'data' => [],
                                'available' => false,
                                'error' => "房间已被入住，退房日期为 {$occupiedOrder['check_out_date']}",
                                'errorCode' => 'ROOM_OCCUPIED',
                                'occupiedUntil' => $occupiedOrder['check_out_date']
                            ];
                        }
                    }
                }
                
                $conflicts = $this->getConflictingOrders($roomId, $checkInDate, $checkOutDate, $excludeOrderId);
                
                if (!empty($conflicts)) {
                    $pdo->rollBack();
                    return [
                        'success' => true,
                        'data' => [],
                        'available' => false,
                        'error' => "房间在 {$checkInDate} 至 {$checkOutDate} 期间已有预订冲突",
                        'errorCode' => 'DATE_CONFLICT',
                        'conflicts' => $conflicts
                    ];
                }
                
                $room['isAvailable'] = true;
                $room['checkInDate'] = $checkInDate;
                $room['checkOutDate'] = $checkOutDate;
                
                $pdo->commit();
                
                return [
                    'success' => true,
                    'data' => [$this->formatRoom($room)],
                    'available' => true
                ];
                
            } else {
                $rooms = $this->db->fetchAll("SELECT * FROM rooms WHERE status != 'maintenance' ORDER BY floor, room_number");
                $availableRooms = [];
                
                foreach ($rooms as $room) {
                    $conflicts = $this->getConflictingOrders($room['id'], $checkInDate, $checkOutDate);
                    
                    if (empty($conflicts)) {
                        $availableRooms[] = $this->formatRoom($room);
                    }
                }
                
                $pdo->commit();
                
                return [
                    'success' => true,
                    'data' => $availableRooms,
                    'available' => count($availableRooms) > 0,
                    'totalAvailable' => count($availableRooms),
                    'checkInDate' => $checkInDate,
                    'checkOutDate' => $checkOutDate
                ];
            }
            
        } catch (Exception $e) {
            try { $pdo->rollBack(); } catch (Exception $ex) {}
            return [
                'success' => false,
                'error' => '检查可用性时出错: ' . $e->getMessage(),
                'errorCode' => 'CHECK_ERROR'
            ];
        }
    }
    
    private function getConflictingOrders($roomId, $checkInDate, $checkOutDate, $excludeOrderId = null) {
        $activeStatuses = ACTIVE_ORDER_STATUSES;
        $placeholders = implode(',', array_fill(0, count($activeStatuses), '?'));
        
        $sql = "SELECT o.* FROM orders o
                WHERE o.room_id = ?
                  AND o.status IN ($placeholders)";
        
        $params = [$roomId, ...$activeStatuses];
        
        if ($excludeOrderId) {
            $sql .= " AND o.id != ?";
            $params[] = $excludeOrderId;
        }
        
        $orders = $this->db->fetchAll($sql, $params);
        
        $conflicts = [];
        foreach ($orders as $order) {
            if (checkDateConflict(
                $order['check_in_date'],
                $order['check_out_date'],
                $checkInDate,
                $checkOutDate
            )) {
                $conflicts[] = [
                    'orderId' => (int)$order['id'],
                    'orderNumber' => $order['order_number'],
                    'guestName' => $order['guest_name'],
                    'checkInDate' => $order['check_in_date'],
                    'checkOutDate' => $order['check_out_date'],
                    'status' => $order['status']
                ];
            }
        }
        
        return $conflicts;
    }
    
    public function updateStatus($roomId, $data) {
        $status = isset($data['status']) ? $data['status'] : null;
        
        if (empty($status)) {
            return ['success' => false, 'error' => '状态不能为空', 'errorCode' => 'MISSING_STATUS'];
        }
        
        $validStatuses = ROOM_STATUSES;
        if (!in_array($status, $validStatuses)) {
            return ['success' => false, 'error' => '无效的房间状态', 'errorCode' => 'INVALID_STATUS'];
        }
        
        $room = $this->db->fetchOne("SELECT * FROM rooms WHERE id = ?", [$roomId]);
        if (!$room) {
            return ['success' => false, 'error' => '房间不存在', 'errorCode' => 'ROOM_NOT_FOUND'];
        }
        
        if ($room['status'] === $status) {
            return ['success' => true, 'message' => '状态未改变', 'skipped' => true];
        }
        
        if ($room['status'] === ROOM_STATUSES['OCCUPIED'] && $status !== ROOM_STATUSES['CLEANING']) {
            $occupiedOrder = $this->db->fetchOne(
                "SELECT o.* FROM orders o
                 WHERE o.room_id = ? AND o.status = 'checked_in'
                 LIMIT 1",
                [$roomId]
            );
            
            if ($occupiedOrder) {
                return [
                    'success' => false,
                    'error' => '房间有在住订单，无法直接修改状态，请先处理订单',
                    'errorCode' => 'ROOM_OCCUPIED_CANNOT_CHANGE'
                ];
            }
        }
        
        $this->db->execute(
            "UPDATE rooms SET status = ?, updated_at = datetime('now') WHERE id = ?",
            [$status, $roomId]
        );
        
        $updatedRoom = $this->db->fetchOne("SELECT * FROM rooms WHERE id = ?", [$roomId]);
        
        return [
            'success' => true,
            'data' => $this->formatRoom($updatedRoom),
            'oldStatus' => $room['status'],
            'newStatus' => $status
        ];
    }
    
    public function lock($roomId, $data) {
        $lockType = isset($data['lockType']) ? $data['lockType'] : LOCK_TYPES['BOOKING'];
        $lockReason = isset($data['lockReason']) ? $data['lockReason'] : null;
        $lockedBy = isset($data['lockedBy']) ? $data['lockedBy'] : 'system';
        $timeout = isset($data['timeout']) ? (int)$data['timeout'] : LOCK_TIMEOUT_SECONDS;
        
        $pdo = $this->db->getConnection();
        
        try {
            $pdo->exec('BEGIN IMMEDIATE TRANSACTION');
            
            $existingLock = $this->db->fetchOne(
                "SELECT * FROM room_locks 
                 WHERE room_id = ? 
                   AND is_active = 1
                   AND (expires_at IS NULL OR expires_at > datetime('now'))",
                [$roomId]
            );
            
            if ($existingLock) {
                $pdo->rollBack();
                return [
                    'success' => false,
                    'error' => "房间已被锁定，锁类型: {$existingLock['lock_type']}，原因: " . ($existingLock['lock_reason'] ?? '未知'),
                    'errorCode' => 'ROOM_ALREADY_LOCKED'
                ];
            }
            
            $expiresAt = $timeout > 0 
                ? date('Y-m-d H:i:s', time() + $timeout)
                : null;
            
            $this->db->execute(
                "INSERT INTO room_locks (room_id, lock_type, lock_reason, locked_by, expires_at, is_active, locked_at)
                 VALUES (?, ?, ?, ?, ?, 1, datetime('now'))",
                [$roomId, $lockType, $lockReason, $lockedBy, $expiresAt]
            );
            
            $lockId = $this->db->lastInsertId();
            
            $pdo->commit();
            
            return [
                'success' => true,
                'lockId' => $lockId,
                'roomId' => (int)$roomId,
                'lockType' => $lockType,
                'expiresAt' => $expiresAt
            ];
            
        } catch (Exception $e) {
            try { $pdo->rollBack(); } catch (Exception $ex) {}
            return [
                'success' => false,
                'error' => '获取锁失败: ' . $e->getMessage(),
                'errorCode' => 'LOCK_FAILED'
            ];
        }
    }
    
    public function unlock($roomId) {
        $this->db->execute(
            "UPDATE room_locks SET is_active = 0 WHERE room_id = ? AND is_active = 1",
            [$roomId]
        );
        
        return [
            'success' => true,
            'message' => '房间已解锁'
        ];
    }
    
    private function formatRooms($rooms) {
        return array_map([$this, 'formatRoom'], $rooms);
    }
    
    private function formatRoom($room) {
        if (!$room) return null;
        
        $amenities = isset($room['amenities']) ? json_decode($room['amenities'], true) : null;
        
        return [
            'id' => (int)$room['id'],
            'roomNumber' => $room['room_number'],
            'type' => $room['type'],
            'floor' => (int)$room['floor'],
            'price' => (float)$room['price'],
            'maxGuests' => (int)$room['max_guests'],
            'status' => $room['status'],
            'amenities' => $amenities,
            'description' => isset($room['description']) ? $room['description'] : null,
            'createdAt' => isset($room['created_at']) ? $room['created_at'] : null,
            'updatedAt' => isset($room['updated_at']) ? $room['updated_at'] : null
        ];
    }
}
