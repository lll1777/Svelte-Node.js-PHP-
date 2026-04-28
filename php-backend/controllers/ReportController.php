<?php
class ReportController {
    private $db;
    
    public function __construct($db) {
        $this->db = $db;
    }
    
    public function getOccupancy($params = []) {
        $date = $params['date'] ?? date('Y-m-d');
        
        $totalRoomsSql = "SELECT COUNT(*) as count FROM rooms WHERE status != 'maintenance'";
        $totalRooms = $this->db->fetchOne($totalRoomsSql)['count'];
        
        $occupiedSql = "SELECT COUNT(DISTINCT o.room_id) as count
                        FROM orders o
                        WHERE o.status IN ('paid', 'checked_in')
                        AND o.check_in_date <= ?
                        AND o.check_out_date > ?";
        $occupiedRooms = $this->db->fetchOne($occupiedSql, [$date, $date])['count'];
        
        $checkedInSql = "SELECT COUNT(*) as count
                         FROM orders o
                         WHERE o.status = 'checked_in'";
        $checkedInCount = $this->db->fetchOne($checkedInSql)['count'];
        
        $todayCheckInSql = "SELECT COUNT(*) as count
                            FROM orders o
                            WHERE o.check_in_date = ?
                            AND o.status NOT IN ('cancelled', 'refunded')";
        $todayCheckIns = $this->db->fetchOne($todayCheckInSql, [$date])['count'];
        
        $todayCheckOutSql = "SELECT COUNT(*) as count
                             FROM orders o
                             WHERE o.check_out_date = ?
                             AND o.status NOT IN ('cancelled', 'refunded')";
        $todayCheckOuts = $this->db->fetchOne($todayCheckOutSql, [$date])['count'];
        
        $occupancyRate = $totalRooms > 0 ? round(($occupiedRooms / $totalRooms) * 100, 2) : 0;
        
        return [
            'success' => true,
            'data' => [
                'date' => $date,
                'totalRooms' => (int)$totalRooms,
                'occupiedRooms' => (int)$occupiedRooms,
                'checkedInCount' => (int)$checkedInCount,
                'todayCheckIns' => (int)$todayCheckIns,
                'todayCheckOuts' => (int)$todayCheckOuts,
                'occupancyRate' => (float)$occupancyRate,
                'availableRooms' => (int)($totalRooms - $occupiedRooms)
            ]
        ];
    }
    
    public function getRoomTypeStats($params = []) {
        $startDate = $params['startDate'] ?? date('Y-m-01');
        $endDate = $params['endDate'] ?? date('Y-m-d');
        
        $sql = "SELECT 
                    r.type as room_type,
                    COUNT(o.id) as total_orders,
                    SUM(o.total_amount) as total_revenue,
                    AVG(o.total_amount) as avg_order_value
                FROM orders o
                LEFT JOIN rooms r ON o.room_id = r.id
                WHERE date(o.created_at) BETWEEN ? AND ?
                    AND o.status NOT IN ('cancelled', 'refunded')
                GROUP BY r.type
                ORDER BY total_revenue DESC";
        
        $results = $this->db->fetchAll($sql, [$startDate, $endDate]);
        
        $formatted = array_map(function($row) {
            return [
                'roomType' => $row['room_type'],
                'totalOrders' => (int)$row['total_orders'],
                'totalRevenue' => (float)$row['total_revenue'],
                'avgOrderValue' => (float)$row['avg_order_value']
            ];
        }, $results);
        
        return [
            'success' => true,
            'data' => $formatted,
            'startDate' => $startDate,
            'endDate' => $endDate
        ];
    }
    
    public function getPaymentStats($params = []) {
        $startDate = $params['startDate'] ?? date('Y-m-01');
        $endDate = $params['endDate'] ?? date('Y-m-d');
        
        $sql = "SELECT 
                    payment_method,
                    status,
                    COUNT(*) as count,
                    SUM(amount) as total
                FROM payments
                WHERE date(created_at) BETWEEN ? AND ?
                GROUP BY payment_method, status";
        
        $results = $this->db->fetchAll($sql, [$startDate, $endDate]);
        
        $stats = [];
        
        foreach ($results as $row) {
            $method = $row['payment_method'];
            $status = $row['status'];
            
            if (!isset($stats[$method])) {
                $stats[$method] = [
                    'total' => 0,
                    'count' => 0,
                    'byStatus' => []
                ];
            }
            
            if ($status === 'completed') {
                $stats[$method]['total'] += (float)$row['total'];
                $stats[$method]['count'] += (int)$row['count'];
            }
            
            $stats[$method]['byStatus'][$status] = [
                'count' => (int)$row['count'],
                'total' => (float)$row['total']
            ];
        }
        
        return [
            'success' => true,
            'data' => $stats,
            'startDate' => $startDate,
            'endDate' => $endDate
        ];
    }
}
