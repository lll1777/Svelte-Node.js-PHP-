<?php
define('ORDER_STATUSES', [
    'PENDING' => 'pending',
    'PAID' => 'paid',
    'CHECKED_IN' => 'checked_in',
    'CHECKED_OUT' => 'checked_out',
    'CANCELLED' => 'cancelled',
    'REFUNDED' => 'refunded'
]);

define('ROOM_STATUSES', [
    'AVAILABLE' => 'available',
    'OCCUPIED' => 'occupied',
    'CLEANING' => 'cleaning',
    'MAINTENANCE' => 'maintenance'
]);

define('LOCK_TYPES', [
    'BOOKING' => 'booking',
    'MAINTENANCE' => 'maintenance',
    'TEMP' => 'temp'
]);

define('ORDER_STATUS_TRANSITIONS', [
    'pending' => [
        'allowedTo' => ['paid', 'cancelled'],
        'description' => '待支付订单可支付或取消'
    ],
    'paid' => [
        'allowedTo' => ['checked_in', 'cancelled', 'refunded'],
        'description' => '已支付订单可入住、取消或退款'
    ],
    'checked_in' => [
        'allowedTo' => ['checked_out'],
        'description' => '已入住订单只能退房，不可取消',
        'isLocked' => true
    ],
    'checked_out' => [
        'allowedTo' => [],
        'description' => '已退房订单为终态，不可变更',
        'isTerminal' => true
    ],
    'cancelled' => [
        'allowedTo' => [],
        'description' => '已取消订单为终态，不可变更',
        'isTerminal' => true
    ],
    'refunded' => [
        'allowedTo' => [],
        'description' => '已退款订单为终态，不可变更',
        'isTerminal' => true
    ]
]);

define('ACTIVE_ORDER_STATUSES', ['pending', 'paid', 'checked_in']);

define('LOCK_TIMEOUT_SECONDS', 300);

function canTransitionStatus($fromStatus, $toStatus) {
    if (empty($fromStatus) || empty($toStatus)) {
        return ['allowed' => false, 'reason' => '状态不能为空'];
    }
    
    $transitions = ORDER_STATUS_TRANSITIONS;
    
    if (!isset($transitions[$fromStatus])) {
        return ['allowed' => false, 'reason' => '未知的起始状态: ' . $fromStatus];
    }
    
    $rule = $transitions[$fromStatus];
    
    if (isset($rule['isTerminal']) && $rule['isTerminal']) {
        return ['allowed' => false, 'reason' => "订单状态为[$fromStatus]，为终态不可变更"];
    }
    
    if (isset($rule['isLocked']) && $rule['isLocked'] && $toStatus !== ORDER_STATUSES['CHECKED_OUT']) {
        return ['allowed' => false, 'reason' => "订单状态为[$fromStatus]，锁定状态，只能执行退房操作"];
    }
    
    if (!in_array($toStatus, $rule['allowedTo'])) {
        return [
            'allowed' => false,
            'reason' => "不允许从状态[$fromStatus]转换到[$toStatus]，允许的转换为: [" . implode(', ', $rule['allowedTo']) . "]"
        ];
    }
    
    return ['allowed' => true];
}

function isTerminalStatus($status) {
    $transitions = ORDER_STATUS_TRANSITIONS;
    return isset($transitions[$status]['isTerminal']) && $transitions[$status]['isTerminal'];
}

function isLockedStatus($status) {
    $transitions = ORDER_STATUS_TRANSITIONS;
    return isset($transitions[$status]['isLocked']) && $transitions[$status]['isLocked'];
}

function validateOrderDates($checkInDate, $checkOutDate) {
    if (empty($checkInDate) || empty($checkOutDate)) {
        return ['valid' => false, 'reason' => '入住日期和退房日期不能为空'];
    }
    
    $checkIn = DateTime::createFromFormat('Y-m-d', $checkInDate);
    $checkOut = DateTime::createFromFormat('Y-m-d', $checkOutDate);
    $today = new DateTime();
    $today->setTime(0, 0, 0);
    
    if (!$checkIn || $checkIn->format('Y-m-d') !== $checkInDate) {
        return ['valid' => false, 'reason' => '入住日期格式无效'];
    }
    
    if (!$checkOut || $checkOut->format('Y-m-d') !== $checkOutDate) {
        return ['valid' => false, 'reason' => '退房日期格式无效'];
    }
    
    if ($checkIn >= $checkOut) {
        return ['valid' => false, 'reason' => '入住日期必须早于退房日期'];
    }
    
    $nights = $checkOut->diff($checkIn)->days;
    
    return [
        'valid' => true,
        'nights' => $nights,
        'checkInDate' => $checkInDate,
        'checkOutDate' => $checkOutDate
    ];
}

function checkDateConflict($existingCheckIn, $existingCheckOut, $newCheckIn, $newCheckOut) {
    $existingCI = DateTime::createFromFormat('Y-m-d', $existingCheckIn);
    $existingCO = DateTime::createFromFormat('Y-m-d', $existingCheckOut);
    $newCI = DateTime::createFromFormat('Y-m-d', $newCheckIn);
    $newCO = DateTime::createFromFormat('Y-m-d', $newCheckOut);
    
    if (!$existingCI || !$existingCO || !$newCI || !$newCO) {
        return false;
    }
    
    $hasConflict = !($newCO <= $existingCI || $newCI >= $existingCO);
    
    return $hasConflict;
}

function getStatusDisplayText($status) {
    $texts = [
        'pending' => '待支付',
        'paid' => '已支付',
        'checked_in' => '已入住',
        'checked_out' => '已退房',
        'cancelled' => '已取消',
        'refunded' => '已退款'
    ];
    return isset($texts[$status]) ? $texts[$status] : $status;
}

function getRoomStatusDisplayText($status) {
    $texts = [
        'available' => '可用',
        'occupied' => '已入住',
        'cleaning' => '清洁中',
        'maintenance' => '维护中'
    ];
    return isset($texts[$status]) ? $texts[$status] : $status;
}
