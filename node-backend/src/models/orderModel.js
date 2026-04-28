const { runQuery, getOne, getAll, getDatabase } = require('./database')
const dayjs = require('dayjs')
const { 
  ORDER_STATUSES, 
  ROOM_STATUSES,
  ORDER_STATUS_TRANSITIONS,
  canTransitionStatus,
  isTerminalStatus,
  isLockedStatus,
  validateOrderDates,
  getStatusDisplayText
} = require('./stateMachine')
const { 
  canCancelOrder,
  canCheckIn,
  canCheckOut,
  canChangeRoom,
  canUpdateStatus,
  getStatusLabel
} = require('./orderService')
const { 
  acquireRoomLock, 
  releaseRoomLock, 
  checkRoomAvailability, 
  setRoomStatus,
  syncRoomStatusWithOrder,
  getRoomActiveOrders
} = require('./roomLock')

function generateOrderNumber() {
  const date = dayjs().format('YYYYMMDD')
  const random = Math.random().toString(36).substring(2, 8).toUpperCase()
  return `HT${date}${random}`
}

function createOrder(orderData) {
  const db = getDatabase()
  
  if (!orderData.roomId) {
    return { success: false, error: '请选择房间', errorCode: 'MISSING_ROOM' }
  }
  
  if (!orderData.guestName || !orderData.guestPhone) {
    return { success: false, error: '客人姓名和电话不能为空', errorCode: 'MISSING_GUEST_INFO' }
  }
  
  if (!orderData.checkInDate || !orderData.checkOutDate) {
    return { success: false, error: '入住日期和退房日期不能为空', errorCode: 'MISSING_DATES' }
  }
  
  const dateValidation = validateOrderDates(orderData.checkInDate, orderData.checkOutDate)
  if (!dateValidation.valid) {
    return { success: false, error: dateValidation.reason, errorCode: 'INVALID_DATES' }
  }
  
  const roomId = parseInt(orderData.roomId)
  
  try {
    const lockResult = acquireRoomLock(roomId, 'booking', `预订锁定: ${orderData.guestName}`)
    if (!lockResult.success) {
      return { success: false, error: lockResult.error, errorCode: 'LOCK_FAILED' }
    }
    
    try {
      const availability = checkRoomAvailability(
        roomId, 
        orderData.checkInDate, 
        orderData.checkOutDate
      )
      
      if (!availability.available) {
        releaseRoomLock(roomId)
        return { 
          success: false, 
          error: availability.error, 
          errorCode: availability.errorCode || 'NOT_AVAILABLE',
          details: availability
        }
      }
      
      db.exec('BEGIN IMMEDIATE TRANSACTION')
      
      const orderNumber = generateOrderNumber()
      const now = dayjs().format('YYYY-MM-DD HH:mm:ss')
      const initialStatus = ORDER_STATUSES.PENDING
      
      const result = runQuery(`
        INSERT INTO orders (
          order_number, room_id, guest_name, guest_phone, guest_id_card,
          check_in_date, check_out_date, guest_count, special_requests,
          total_amount, paid_amount, refund_amount, status, source, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?)
      `, [
        orderNumber,
        roomId,
        orderData.guestName,
        orderData.guestPhone,
        orderData.guestIdCard || null,
        orderData.checkInDate,
        orderData.checkOutDate,
        orderData.guestCount || 1,
        orderData.specialRequests || null,
        orderData.totalAmount || 0,
        initialStatus,
        orderData.source || 'direct',
        now,
        now
      ])
      
      if (!result.success) {
        db.exec('ROLLBACK')
        releaseRoomLock(roomId)
        return { success: false, error: '创建订单失败', errorCode: 'INSERT_FAILED' }
      }
      
      const orderId = result.lastInsertRowid
      
      const historyResult = runQuery(`
        INSERT INTO order_status_history (order_id, old_status, new_status, changed_by, remark, changed_at)
        VALUES (?, NULL, ?, ?, ?, ?)
      `, [orderId, initialStatus, orderData.guestName || 'guest', '创建订单', now])
      
      if (!historyResult.success) {
        console.warn('记录状态历史失败，但订单已创建')
      }
      
      db.exec('COMMIT')
      
      const order = getOrderById(orderId)
      
      return { 
        success: true, 
        data: order,
        message: '订单创建成功'
      }
      
    } catch (error) {
      releaseRoomLock(roomId)
      throw error
    }
    
  } catch (error) {
    console.error('创建订单失败:', error)
    return { success: false, error: `系统错误: ${error.message}`, errorCode: 'SYSTEM_ERROR' }
  }
}

function getOrderById(orderId) {
  const sql = `
    SELECT o.*, 
           r.room_number, r.type as room_type, r.price as room_price, r.status as room_status
    FROM orders o
    LEFT JOIN rooms r ON o.room_id = r.id
    WHERE o.id = ?
  `
  return getOne(sql, [orderId])
}

function getOrderByNumber(orderNumber) {
  const sql = `
    SELECT o.*, 
           r.room_number, r.type as room_type, r.price as room_price
    FROM orders o
    LEFT JOIN rooms r ON o.room_id = r.id
    WHERE o.order_number = ?
  `
  return getOne(sql, [orderNumber])
}

function getOrders(filters = {}) {
  let sql = `
    SELECT o.*, 
           r.room_number, r.type as room_type, r.price as room_price
    FROM orders o
    LEFT JOIN rooms r ON o.room_id = r.id
    WHERE 1=1
  `
  const params = []
  
  if (filters.status) {
    sql += ' AND o.status = ?'
    params.push(filters.status)
  }
  if (filters.guestName) {
    sql += ' AND o.guest_name LIKE ?'
    params.push(`%${filters.guestName}%`)
  }
  if (filters.roomId) {
    sql += ' AND o.room_id = ?'
    params.push(filters.roomId)
  }
  if (filters.checkInDate) {
    sql += ' AND o.check_in_date = ?'
    params.push(filters.checkInDate)
  }
  if (filters.checkOutDate) {
    sql += ' AND o.check_out_date = ?'
    params.push(filters.checkOutDate)
  }
  
  sql += ' ORDER BY o.created_at DESC'
  
  if (filters.limit) {
    sql += ' LIMIT ?'
    params.push(filters.limit)
  }
  
  return getAll(sql, params)
}

function updateOrderStatus(orderId, newStatus, changedBy = 'system', remark = null) {
  const db = getDatabase()
  
  const order = getOrderById(orderId)
  
  const statusCheck = canUpdateStatus(order, newStatus)
  if (!statusCheck.allowed) {
    if (statusCheck.skipped) {
      return { success: true, message: '状态未改变', skipped: true }
    }
    return { 
      success: false, 
      error: statusCheck.reason,
      errorCode: statusCheck.errorCode,
      fromStatus: order?.status,
      toStatus: newStatus
    }
  }
  
  try {
    db.exec('BEGIN IMMEDIATE TRANSACTION')
    
    const now = dayjs().format('YYYY-MM-DD HH:mm:ss')
    
    const updateResult = runQuery(`
      UPDATE orders 
      SET status = ?, updated_at = ?
      WHERE id = ?
    `, [newStatus, now, orderId])
    
    if (!updateResult.success) {
      db.exec('ROLLBACK')
      return { success: false, error: '更新订单状态失败', errorCode: 'UPDATE_FAILED' }
    }
    
    const historyResult = runQuery(`
      INSERT INTO order_status_history (order_id, old_status, new_status, changed_by, remark, changed_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [orderId, order.status, newStatus, changedBy, remark, now])
    
    if (!historyResult.success) {
      console.warn('记录状态历史失败')
    }
    
    if (newStatus === ORDER_STATUSES.CHECKED_OUT) {
      const roomResult = setRoomStatus(order.room_id, ROOM_STATUSES.CLEANING, '退房后等待清洁')
      if (!roomResult.success) {
        console.warn('更新房间状态失败:', roomResult.error)
      }
      
      runQuery(`
        INSERT INTO cleaning_schedule (room_id, order_id, schedule_date, priority, status, created_at)
        VALUES (?, ?, ?, 'urgent', 'pending', ?)
      `, [order.room_id, orderId, dayjs().format('YYYY-MM-DD'), now])
    }
    
    if (newStatus === ORDER_STATUSES.CANCELLED || newStatus === ORDER_STATUSES.REFUNDED) {
      const activeOrders = getRoomActiveOrders(order.room_id)
      const otherActiveOrders = activeOrders.filter(o => o.id !== orderId)
      
      if (otherActiveOrders.length === 0) {
        setRoomStatus(order.room_id, ROOM_STATUSES.AVAILABLE, '订单取消/退款后释放')
      }
    }
    
    db.exec('COMMIT')
    
    releaseRoomLock(order.room_id)
    
    return { 
      success: true, 
      message: `订单状态已从 [${getStatusLabel(order.status)}] 更新为 [${getStatusLabel(newStatus)}]`,
      fromStatus: order.status,
      toStatus: newStatus
    }
    
  } catch (error) {
    try { db.exec('ROLLBACK') } catch (e) {}
    return { success: false, error: `更新状态失败: ${error.message}`, errorCode: 'TRANSACTION_ERROR' }
  }
}

function addOrderStatusHistory(orderId, oldStatus, newStatus, changedBy = 'system', remark = null) {
  const sql = `
    INSERT INTO order_status_history (order_id, old_status, new_status, changed_by, remark, changed_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `
  const now = dayjs().format('YYYY-MM-DD HH:mm:ss')
  return runQuery(sql, [orderId, oldStatus, newStatus, changedBy, remark, now])
}

function getOrderStatusHistory(orderId) {
  const sql = `
    SELECT * FROM order_status_history 
    WHERE order_id = ? 
    ORDER BY changed_at DESC
  `
  return getAll(sql, [orderId])
}

function checkIn(orderId, checkInData) {
  const db = getDatabase()
  
  const order = getOrderById(orderId)
  
  const today = dayjs().format('YYYY-MM-DD')
  const checkInCheck = canCheckIn(order, today)
  if (!checkInCheck.allowed) {
    return {
      success: false,
      error: checkInCheck.reason,
      errorCode: checkInCheck.errorCode
    }
  }
  
  try {
    db.exec('BEGIN IMMEDIATE TRANSACTION')
    
    const now = dayjs().format('YYYY-MM-DD HH:mm:ss')
    
    const updateOrderResult = runQuery(`
      UPDATE orders 
      SET status = ?, actual_check_in_time = ?, updated_at = ?
      WHERE id = ?
    `, [ORDER_STATUSES.CHECKED_IN, now, now, orderId])
    
    if (!updateOrderResult.success) {
      db.exec('ROLLBACK')
      return { success: false, error: '更新订单状态失败', errorCode: 'UPDATE_FAILED' }
    }
    
    addOrderStatusHistory(
      orderId, 
      ORDER_STATUSES.PAID, 
      ORDER_STATUSES.CHECKED_IN, 
      checkInData?.operator || 'system', 
      '办理入住'
    )
    
    const roomResult = setRoomStatus(order.room_id, ROOM_STATUSES.OCCUPIED, '办理入住')
    if (!roomResult.success) {
      console.warn('更新房间状态失败:', roomResult.error)
    }
    
    db.exec('COMMIT')
    
    releaseRoomLock(order.room_id)
    
    return { 
      success: true, 
      message: '入住成功',
      orderNumber: order.order_number,
      roomNumber: order.room_number,
      checkInTime: now
    }
    
  } catch (error) {
    try { db.exec('ROLLBACK') } catch (e) {}
    return { success: false, error: `入住失败: ${error.message}`, errorCode: 'CHECKIN_ERROR' }
  }
}

function checkOut(orderId, checkOutData) {
  const order = getOrderById(orderId)
  
  const checkOutCheck = canCheckOut(order)
  if (!checkOutCheck.allowed) {
    return {
      success: false,
      error: checkOutCheck.reason,
      errorCode: checkOutCheck.errorCode,
      balance: checkOutCheck.balance
    }
  }
  
  return updateOrderStatus(
    orderId, 
    ORDER_STATUSES.CHECKED_OUT, 
    checkOutData?.operator || 'system',
    '办理退房'
  )
}

function changeRoom(orderId, newRoomId, changeReason, operator = 'system') {
  const db = getDatabase()
  
  const order = getOrderById(orderId)
  
  const changeRoomCheck = canChangeRoom(order)
  if (!changeRoomCheck.allowed) {
    return {
      success: false,
      error: changeRoomCheck.reason,
      errorCode: changeRoomCheck.errorCode
    }
  }
  
  if (parseInt(order.room_id) === parseInt(newRoomId)) {
    return { success: true, message: '新房间与原房间相同', skipped: true }
  }
  
  const newRoom = getOne('SELECT * FROM rooms WHERE id = ?', [newRoomId])
  if (!newRoom) {
    return { success: false, error: '新房间不存在', errorCode: 'NEW_ROOM_NOT_FOUND' }
  }
  
  if (newRoom.status === ROOM_STATUSES.MAINTENANCE) {
    return { success: false, error: '新房间正在维护中', errorCode: 'ROOM_MAINTENANCE' }
  }
  
  const availability = checkRoomAvailability(
    newRoomId,
    order.check_in_date,
    order.check_out_date,
    orderId
  )
  
  if (!availability.available) {
    return { 
      success: false, 
      error: availability.error, 
      errorCode: 'ROOM_NOT_AVAILABLE',
      details: availability
    }
  }
  
  try {
    const newLock = acquireRoomLock(newRoomId, 'booking', `换房锁定: ${order.guest_name}`)
    if (!newLock.success) {
      return { success: false, error: newLock.error, errorCode: 'LOCK_FAILED' }
    }
    
    try {
      db.exec('BEGIN IMMEDIATE TRANSACTION')
      
      const now = dayjs().format('YYYY-MM-DD HH:mm:ss')
      const oldRoomId = order.room_id
      const priceAdjustment = (newRoom.price || 0) - (order.room_price || 0)
      
      const updateOrderResult = runQuery(`
        UPDATE orders 
        SET room_id = ?, 
            total_amount = total_amount + ?,
            updated_at = ?
        WHERE id = ?
      `, [newRoomId, priceAdjustment, now, orderId])
      
      if (!updateOrderResult.success) {
        db.exec('ROLLBACK')
        return { success: false, error: '更新订单房间失败', errorCode: 'UPDATE_FAILED' }
      }
      
      runQuery(`
        INSERT INTO room_changes (order_id, old_room_id, new_room_id, change_reason, price_adjustment, changed_by, changed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [orderId, oldRoomId, newRoomId, changeReason, priceAdjustment, operator, now])
      
      runQuery(`
        UPDATE rooms 
        SET status = 'cleaning', updated_at = ?
        WHERE id = ?
      `, [now, oldRoomId])
      
      const newStatus = order.status === ORDER_STATUSES.CHECKED_IN ? ROOM_STATUSES.OCCUPIED : ROOM_STATUSES.AVAILABLE
      runQuery(`
        UPDATE rooms 
        SET status = ?, updated_at = ?
        WHERE id = ?
      `, [newStatus, now, newRoomId])
      
      db.exec('COMMIT')
      
      releaseRoomLock(oldRoomId)
      
      return { 
        success: true, 
        message: '换房成功',
        oldRoomId,
        newRoomId,
        priceAdjustment,
        oldRoomNumber: order.room_number,
        newRoomNumber: newRoom.room_number
      }
      
    } catch (error) {
      releaseRoomLock(newRoomId)
      throw error
    }
    
  } catch (error) {
    try { db.exec('ROLLBACK') } catch (e) {}
    return { success: false, error: `换房失败: ${error.message}`, errorCode: 'CHANGE_ROOM_ERROR' }
  }
}

function cancelOrder(orderId, cancelReason, operator = 'system') {
  const order = getOrderById(orderId)
  
  const cancelCheck = canCancelOrder(order)
  if (!cancelCheck.allowed) {
    return {
      success: false,
      error: cancelCheck.reason,
      errorCode: cancelCheck.errorCode,
      paidAmount: cancelCheck.paidAmount
    }
  }
  
  return updateOrderStatus(
    orderId,
    ORDER_STATUSES.CANCELLED,
    operator,
    cancelReason || '用户取消'
  )
}

function getTodayOrders() {
  const today = dayjs().format('YYYY-MM-DD')
  const sql = `
    SELECT o.*, 
           r.room_number, r.type as room_type
    FROM orders o
    LEFT JOIN rooms r ON o.room_id = r.id
    WHERE o.check_in_date = ? OR o.check_out_date = ?
    ORDER BY o.created_at DESC
  `
  return getAll(sql, [today, today])
}

module.exports = {
  generateOrderNumber,
  createOrder,
  getOrderById,
  getOrderByNumber,
  getOrders,
  updateOrderStatus,
  addOrderStatusHistory,
  getOrderStatusHistory,
  checkIn,
  checkOut,
  changeRoom,
  cancelOrder,
  getTodayOrders
}
