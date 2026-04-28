<?php
class RoomController {
    private $db;
    
    public function __construct($db) {
        $this->db = $db;
    }
    
    public function getAll($params = []) {
        $sql = "SELECT * FROM rooms WHERE 1=1";
        $bindParams = [];
        
        if (isset($params['status']) && $params['status']) {
            $sql .= " AND status = ?";
            $bindParams[] = $params['status'];
        }
        
        if (isset($params['floor']) && $params['floor']) {
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
            return ['success' => false, 'error' => '房间不存在'];
        }
        
        return [
            'success' => true,
            'data' => $this->formatRoom($room)
        ];
    }
    
    public function getAvailability($params = []) {
        $checkInDate = $params['checkInDate'] ?? date('Y-m-d');
        $checkOutDate = $params['checkOutDate'] ?? date('Y-m-d', strtotime('+1 day'));
        $roomId = $params['roomId'] ?? null;
        
        $sql = "SELECT r.* FROM rooms r
                WHERE r.status = 'available'
                AND r.id NOT IN (
                    SELECT o.room_id FROM orders o
                    WHERE o.status NOT IN ('cancelled', 'refunded', 'checked_out')
                    AND (
                        (o.check_in_date <= ? AND o.check_out_date > ?)
                        OR (o.check_in_date < ? AND o.check_out_date >= ?)
                        OR (o.check_in_date >= ? AND o.check_out_date <= ?)
                    )
                )";
        
        $bindParams = [
            $checkInDate, $checkInDate,
            $checkOutDate, $checkOutDate,
            $checkInDate, $checkOutDate
        ];
        
        if ($roomId) {
            $sql .= " AND r.id = ?";
            $bindParams[] = $roomId;
        }
        
        $rooms = $this->db->fetchAll($sql, $bindParams);
        
        return [
            'success' => true,
            'data' => $this->formatRooms($rooms)
        ];
    }
    
    public function updateStatus($roomId, $data) {
        $status = $data['status'] ?? null;
        
        if (!$status) {
            return ['success' => false, 'error' => '状态不能为空'];
        }
        
        $validStatuses = ['available', 'occupied', 'cleaning', 'maintenance'];
        if (!in_array($status, $validStatuses)) {
            return ['success' => false, 'error' => '无效的状态值'];
        }
        
        $sql = "UPDATE rooms SET status = ?, updated_at = datetime('now') WHERE id = ?";
        $result = $this->db->execute($sql, [$status, $roomId]);
        
        if ($result['rowCount'] === 0) {
            return ['success' => false, 'error' => '房间不存在或状态未改变'];
        }
        
        $room = $this->db->fetchOne("SELECT * FROM rooms WHERE id = ?", [$roomId]);
        
        return [
            'success' => true,
            'data' => $this->formatRoom($room)
        ];
    }
    
    public function lock($roomId, $data) {
        $lockType = $data['lockType'] ?? 'temp';
        $lockReason = $data['lockReason'] ?? null;
        $lockedBy = $data['lockedBy'] ?? 'system';
        $expiresAt = $data['expiresAt'] ?? null;
        
        $sql = "INSERT INTO room_locks (room_id, lock_type, lock_reason, locked_by, expires_at, is_active, locked_at)
                VALUES (?, ?, ?, ?, ?, 1, datetime('now'))";
        
        $result = $this->db->execute($sql, [$roomId, $lockType, $lockReason, $lockedBy, $expiresAt]);
        
        if (!$result['lastInsertId']) {
            return ['success' => false, 'error' => '锁定失败'];
        }
        
        if ($lockType === 'maintenance') {
            $this->updateStatus($roomId, ['status' => 'maintenance']);
        }
        
        return ['success' => true, 'message' => '房间已锁定'];
    }
    
    public function unlock($roomId) {
        $sql = "UPDATE room_locks SET is_active = 0 WHERE room_id = ? AND is_active = 1";
        $this->db->execute($sql, [$roomId]);
        
        $room = $this->db->fetchOne("SELECT * FROM rooms WHERE id = ?", [$roomId]);
        if ($room && $room['status'] === 'maintenance') {
            $this->updateStatus($roomId, ['status' => 'available']);
        }
        
        return ['success' => true, 'message' => '房间已解锁'];
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
            'description' => $room['description'] ?? null,
            'createdAt' => $room['created_at'] ?? null,
            'updatedAt' => $room['updated_at'] ?? null
        ];
    }
}
