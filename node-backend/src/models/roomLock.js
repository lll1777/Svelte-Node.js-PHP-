const { getDatabase, getOne, getAll, runQuery } = require('./database')
const { ROOM_STATUSES, LOCK_TYPES, checkDateConflict } = require('./stateMachine')
const dayjs = require('dayjs')

const LOCK_TIMEOUT_SECONDS = 300
const ACTIVE_ORDER_STATUSES = ['pending', 'paid', 'checked_in']

function acquireRoomLock(roomId, lockType = LOCK_TYPES.BOOKING, lockReason = null, timeout = LOCK_TIMEOUT_SECONDS) {
  const db = getDatabase()
  
  try {
    db.exec('BEGIN IMMEDIATE TRANSACTION')
    
    const existingLock = getOne(`
      SELECT * FROM room_locks 
      WHERE room_id = ? 
        AND is_active = 1
        AND (expires_at IS NULL OR expires_at > datetime('now'))
    `, [roomId])
    
    if (existingLock) {
      db.exec('ROLLBACK')
      return { 
        success: false, 
        error: `房间已被锁定，锁类型: ${existingLock.lock_type}，原因: ${existingLock.lock_reason || '未知'}`
      }
    }
    
    const expiresAt = timeout > 0 
      ? dayjs().add(timeout, 'second').format('YYYY-MM-DD HH:mm:ss')
      : null
    
    const result = runQuery(`
      INSERT INTO room_locks (room_id, lock_type, lock_reason, locked_by, expires_at, is_active, locked_at)
      VALUES (?, ?, ?, 'system', ?, 1, datetime('now'))
    `, [roomId, lockType, lockReason, expiresAt])
    
    if (!result.success) {
      db.exec('ROLLBACK')
      return { success: false, error: '创建锁记录失败' }
    }
    
    db.exec('COMMIT')
    
    return { 
      success: true, 
      lockId: result.lastInsertRowid,
      roomId,
      lockType,
      expiresAt
    }
    
  } catch (error) {
    try { db.exec('ROLLBACK') } catch (e) {}
    return { success: false, error: `获取锁失败: ${error.message}` }
  }
}

function releaseRoomLock(roomId) {
  const db = getDatabase()
  
  try {
    const result = runQuery(`
      UPDATE room_locks 
      SET is_active = 0 
      WHERE room_id = ? AND is_active = 1
    `, [roomId])
    
    return { success: result.success, released: result.changes > 0 }
  } catch (error) {
    return { success: false, error: `释放锁失败: ${error.message}` }
  }
}

function checkRoomAvailability(roomId, checkInDate, checkOutDate, excludeOrderId = null) {
  const db = getDatabase()
  
  try {
    db.exec('BEGIN DEFERRED TRANSACTION')
    
    const room = getOne(`
      SELECT * FROM rooms WHERE id = ?
    `, [roomId])
    
    if (!room) {
      db.exec('ROLLBACK')
      return { 
        available: false, 
        error: '房间不存在',
        errorCode: 'ROOM_NOT_FOUND'
      }
    }
    
    if (room.status === ROOM_STATUSES.MAINTENANCE) {
      db.exec('ROLLBACK')
      return { 
        available: false, 
        error: '房间正在维护中',
        errorCode: 'ROOM_MAINTENANCE',
        roomStatus: room.status
      }
    }
    
    if (room.status === ROOM_STATUSES.OCCUPIED) {
      const occupiedOrder = getOne(`
        SELECT o.* FROM orders o
        WHERE o.room_id = ? 
          AND o.status = 'checked_in'
        LIMIT 1
      `, [roomId])
      
      if (occupiedOrder) {
        const occupiedCheckOut = dayjs(occupiedOrder.check_out_date)
        const newCheckIn = dayjs(checkInDate)
        
        if (newCheckIn.isBefore(occupiedCheckOut)) {
          db.exec('ROLLBACK')
          return { 
            available: false, 
            error: `房间已被入住，退房日期为 ${occupiedOrder.check_out_date}`,
            errorCode: 'ROOM_OCCUPIED',
            occupiedUntil: occupiedOrder.check_out_date
          }
        }
      }
    }
    
    let conflictSql = `
      SELECT o.* FROM orders o
      WHERE o.room_id = ?
        AND o.status IN (${ACTIVE_ORDER_STATUSES.map(() => '?').join(',')})
    `
    const params = [roomId, ...ACTIVE_ORDER_STATUSES]
    
    if (excludeOrderId) {
      conflictSql += ' AND o.id != ?'
      params.push(excludeOrderId)
    }
    
    const conflictingOrders = getAll(conflictSql, params)
    
    const conflicts = []
    for (const order of conflictingOrders) {
      if (checkDateConflict(
        order.check_in_date, 
        order.check_out_date,
        checkInDate,
        checkOutDate
      )) {
        conflicts.push({
          orderId: order.id,
          orderNumber: order.order_number,
          guestName: order.guest_name,
          checkInDate: order.check_in_date,
          checkOutDate: order.check_out_date,
          status: order.status
        })
      }
    }
    
    if (conflicts.length > 0) {
      db.exec('ROLLBACK')
      return { 
        available: false, 
        error: `房间在 ${checkInDate} 至 ${checkOutDate} 期间已有 ${conflicts.length} 个预订冲突`,
        errorCode: 'DATE_CONFLICT',
        conflicts
      }
    }
    
    const activeLock = getOne(`
      SELECT * FROM room_locks 
      WHERE room_id = ? 
        AND is_active = 1
        AND (expires_at IS NULL OR expires_at > datetime('now'))
    `, [roomId])
    
    if (activeLock && activeLock.lock_type === LOCK_TYPES.MAINTENANCE) {
      db.exec('ROLLBACK')
      return { 
        available: false, 
        error: '房间因维护被锁定',
        errorCode: 'ROOM_LOCKED_MAINTENANCE'
      }
    }
    
    db.exec('COMMIT')
    
    return {
      available: true,
      room,
      conflicts: []
    }
    
  } catch (error) {
    try { db.exec('ROLLBACK') } catch (e) {}
    return { 
      available: false, 
      error: `检查可用性时出错: ${error.message}`,
      errorCode: 'CHECK_ERROR'
    }
  }
}

function checkMultipleRoomsAvailability(roomIds, checkInDate, checkOutDate) {
  const results = {}
  
  for (const roomId of roomIds) {
    results[roomId] = checkRoomAvailability(roomId, checkInDate, checkOutDate)
  }
  
  return results
}

function setRoomStatus(roomId, newStatus, reason = null) {
  const db = getDatabase()
  
  try {
    const room = getOne('SELECT * FROM rooms WHERE id = ?', [roomId])
    
    if (!room) {
      return { success: false, error: '房间不存在' }
    }
    
    const validStatuses = Object.values(ROOM_STATUSES)
    if (!validStatuses.includes(newStatus)) {
      return { success: false, error: '无效的房间状态' }
    }
    
    const result = runQuery(`
      UPDATE rooms 
      SET status = ?, updated_at = datetime('now')
      WHERE id = ?
    `, [newStatus, roomId])
    
    if (!result.success) {
      return { success: false, error: '更新房间状态失败' }
    }
    
    return { 
      success: true, 
      oldStatus: room.status,
      newStatus,
      roomId
    }
    
  } catch (error) {
    return { success: false, error: `设置房间状态失败: ${error.message}` }
  }
}

function syncRoomStatusWithOrder(orderId) {
  const order = getOne(`
    SELECT o.*, r.status as room_status
    FROM orders o
    LEFT JOIN rooms r ON o.room_id = r.id
    WHERE o.id = ?
  `, [orderId])
  
  if (!order) {
    return { success: false, error: '订单不存在' }
  }
  
  let expectedRoomStatus
  
  switch (order.status) {
    case 'checked_in':
      expectedRoomStatus = ROOM_STATUSES.OCCUPIED
      break
    case 'checked_out':
      expectedRoomStatus = ROOM_STATUSES.CLEANING
      break
    case 'cancelled':
    case 'refunded':
      expectedRoomStatus = ROOM_STATUSES.AVAILABLE
      break
    default:
      return { 
        success: true, 
        message: '订单状态不需要同步房间状态',
        orderStatus: order.status
      }
  }
  
  if (order.room_status !== expectedRoomStatus) {
    const result = setRoomStatus(order.room_id, expectedRoomStatus, `订单${order.order_number}状态同步`)
    return {
      success: result.success,
      synced: result.success,
      oldStatus: order.room_status,
      newStatus: expectedRoomStatus,
      error: result.error
    }
  }
  
  return {
    success: true,
    synced: false,
    message: '房间状态已同步'
  }
}

function getRoomActiveOrders(roomId) {
  return getAll(`
    SELECT o.* FROM orders o
    WHERE o.room_id = ?
      AND o.status IN (${ACTIVE_ORDER_STATUSES.map(() => '?').join(',')})
    ORDER BY o.check_in_date
  `, [roomId, ...ACTIVE_ORDER_STATUSES])
}

module.exports = {
  acquireRoomLock,
  releaseRoomLock,
  checkRoomAvailability,
  checkMultipleRoomsAvailability,
  setRoomStatus,
  syncRoomStatusWithOrder,
  getRoomActiveOrders,
  ACTIVE_ORDER_STATUSES,
  LOCK_TIMEOUT_SECONDS
}
