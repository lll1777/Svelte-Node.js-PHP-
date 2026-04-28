<?php
class CleaningController {
    private $db;
    
    public function __construct($db) {
        $this->db = $db;
    }
    
    public function getAll($params = []) {
        $sql = "SELECT cs.*, r.room_number, r.type as room_type
                FROM cleaning_schedule cs
                LEFT JOIN rooms r ON cs.room_id = r.id
                WHERE 1=1";
        $bindParams = [];
        
        if (isset($params['status']) && $params['status']) {
            $sql .= " AND cs.status = ?";
            $bindParams[] = $params['status'];
        }
        
        if (isset($params['scheduleDate']) && $params['scheduleDate']) {
            $sql .= " AND cs.schedule_date = ?";
            $bindParams[] = $params['scheduleDate'];
        }
        
        if (isset($params['roomId']) && $params['roomId']) {
            $sql .= " AND cs.room_id = ?";
            $bindParams[] = $params['roomId'];
        }
        
        $sql .= " ORDER BY cs.schedule_date DESC, cs.created_at DESC";
        
        $tasks = $this->db->fetchAll($sql, $bindParams);
        
        return [
            'success' => true,
            'data' => array_map([$this, 'formatTask'], $tasks)
        ];
    }
    
    public function getById($taskId) {
        $sql = "SELECT cs.*, r.room_number, r.type as room_type
                FROM cleaning_schedule cs
                LEFT JOIN rooms r ON cs.room_id = r.id
                WHERE cs.id = ?";
        $task = $this->db->fetchOne($sql, [$taskId]);
        
        if (!$task) {
            return ['success' => false, 'error' => '清洁任务不存在'];
        }
        
        return [
            'success' => true,
            'data' => $this->formatTask($task)
        ];
    }
    
    public function create($data) {
        $roomId = $data['roomId'] ?? null;
        $orderId = $data['orderId'] ?? null;
        $scheduleDate = $data['scheduleDate'] ?? date('Y-m-d');
        $priority = $data['priority'] ?? 'normal';
        $assignedTo = $data['assignedTo'] ?? null;
        $remarks = $data['remarks'] ?? null;
        
        if (!$roomId) {
            return ['success' => false, 'error' => '房间ID不能为空'];
        }
        
        $sql = "INSERT INTO cleaning_schedule 
                (room_id, order_id, schedule_date, priority, status, assigned_to, remarks, created_at)
                VALUES (?, ?, ?, ?, 'pending', ?, ?, datetime('now'))";
        
        $result = $this->db->execute($sql, [$roomId, $orderId, $scheduleDate, $priority, $assignedTo, $remarks]);
        
        if (!$result['lastInsertId']) {
            return ['success' => false, 'error' => '创建清洁任务失败'];
        }
        
        return $this->getById($result['lastInsertId']);
    }
    
    public function updateStatus($taskId, $data) {
        $status = $data['status'] ?? null;
        
        if (!$status) {
            return ['success' => false, 'error' => '状态不能为空'];
        }
        
        $validStatuses = ['pending', 'in_progress', 'completed', 'cancelled'];
        if (!in_array($status, $validStatuses)) {
            return ['success' => false, 'error' => '无效的状态值'];
        }
        
        $currentTask = $this->db->fetchOne(
            "SELECT * FROM cleaning_schedule WHERE id = ?", 
            [$taskId]
        );
        
        if (!$currentTask) {
            return ['success' => false, 'error' => '清洁任务不存在'];
        }
        
        $updates = ['status = ?'];
        $params = [$status];
        
        if ($status === 'in_progress') {
            $updates[] = "started_at = datetime('now')";
        } elseif ($status === 'completed') {
            $updates[] = "completed_at = datetime('now')";
        }
        
        $sql = "UPDATE cleaning_schedule SET " . implode(', ', $updates) . " WHERE id = ?";
        $params[] = $taskId;
        
        $this->db->execute($sql, $params);
        
        return $this->getById($taskId);
    }
    
    private function formatTask($task) {
        if (!$task) return null;
        
        return [
            'id' => (int)$task['id'],
            'roomId' => (int)$task['room_id'],
            'roomNumber' => $task['room_number'] ?? null,
            'roomType' => $task['room_type'] ?? null,
            'orderId' => isset($task['order_id']) ? (int)$task['order_id'] : null,
            'scheduleDate' => $task['schedule_date'],
            'priority' => $task['priority'],
            'status' => $task['status'],
            'assignedTo' => $task['assigned_to'] ?? null,
            'startedAt' => $task['started_at'] ?? null,
            'completedAt' => $task['completed_at'] ?? null,
            'remarks' => $task['remarks'] ?? null,
            'createdAt' => $task['created_at'] ?? null
        ];
    }
}
