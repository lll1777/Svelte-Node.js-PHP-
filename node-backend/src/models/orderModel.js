const { runQuery, getOne, getAll, transaction } = require('./database')
const dayjs = require('dayjs')
const { v4: uuidv4 } = require('uuid')

function generateOrderNumber() {
  const date = dayjs().format('YYYYMMDD')
  const random = Math.random().toString(36).substring(2, 8).toUpperCase()
  return `HT${date}${random}`
}

function createOrder(orderData) {
  const orderNumber = generateOrderNumber()
  
  const sql = `
    INSERT INTO orders (
      order_number, room_id, guest_name, guest_phone, guest_id_card,
      check_in_date, check_out_date, guest_count, special_requests,
      total_amount, status, source, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
  
  const now = dayjs().format('YYYY-MM-DD HH:mm:ss')
  const params = [
    orderNumber,
    orderData.roomId,
    orderData.guestName,
    orderData.guestPhone,
    orderData.guestIdCard || null,
    orderData.checkInDate,
    orderData.checkOutDate,
    orderData.guestCount || 1,
    orderData.specialRequests || null,
    orderData.totalAmount || 0,
    orderData.status || 'pending',
    orderData.source || 'direct',
    now,
    now
  ]
  
  const result = runQuery(sql, params)
  
  if (result.success) {
    const order = getOrderById(result.lastInsertRowid)
    addOrderStatusHistory(result.lastInsertRowid, null, orderData.status || 'pending', orderData.guestName || 'guest')
    return order
  }
  
  return null
}

function getOrderById(orderId) {
  const sql = `
    SELECT o.*, 
           r.room_number, r.type as room_type, r.price as room_price
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
  const order = getOrderById(orderId)
  if (!order) return false
  
  const oldStatus = order.status
  
  const sql = `
    UPDATE orders 
    SET status = ?, updated_at = ?
    WHERE id = ?
  `
  const now = dayjs().format('YYYY-MM-DD HH:mm:ss')
  const result = runQuery(sql, [newStatus, now, orderId])
  
  if (result.success) {
    addOrderStatusHistory(orderId, oldStatus, newStatus, changedBy, remark)
    return true
  }
  
  return false
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
  const order = getOrderById(orderId)
  if (!order) return { success: false, error: '订单不存在' }
  
  if (order.status !== 'paid') {
    return { success: false, error: '订单未支付，无法入住' }
  }
  
  const result = transaction(() => {
    const now = dayjs().format('YYYY-MM-DD HH:mm:ss')
    
    const updateOrderSql = `
      UPDATE orders 
      SET status = 'checked_in', actual_check_in_time = ?, updated_at = ?
      WHERE id = ?
    `
    runQuery(updateOrderSql, [now, now, orderId])
    
    addOrderStatusHistory(orderId, 'paid', 'checked_in', checkInData.operator || 'system', '办理入住')
    
    const updateRoomSql = `
      UPDATE rooms 
      SET status = 'occupied', updated_at = ?
      WHERE id = ?
    `
    runQuery(updateRoomSql, [now, order.room_id])
  })
  
  return result.success ? { success: true } : { success: false, error: result.error }
}

function checkOut(orderId, checkOutData) {
  const order = getOrderById(orderId)
  if (!order) return { success: false, error: '订单不存在' }
  
  if (order.status !== 'checked_in') {
    return { success: false, error: '订单未入住，无法退房' }
  }
  
  const result = transaction(() => {
    const now = dayjs().format('YYYY-MM-DD HH:mm:ss')
    
    const updateOrderSql = `
      UPDATE orders 
      SET status = 'checked_out', actual_check_out_time = ?, updated_at = ?
      WHERE id = ?
    `
    runQuery(updateOrderSql, [now, now, orderId])
    
    addOrderStatusHistory(orderId, 'checked_in', 'checked_out', checkOutData.operator || 'system', '办理退房')
    
    const updateRoomSql = `
      UPDATE rooms 
      SET status = 'cleaning', updated_at = ?
      WHERE id = ?
    `
    runQuery(updateRoomSql, [now, order.room_id])
    
    const cleaningSql = `
      INSERT INTO cleaning_schedule (room_id, order_id, schedule_date, priority, status, created_at)
      VALUES (?, ?, ?, 'urgent', 'pending', ?)
    `
    runQuery(cleaningSql, [order.room_id, orderId, dayjs().format('YYYY-MM-DD'), now])
  })
  
  return result.success ? { success: true } : { success: false, error: result.error }
}

function changeRoom(orderId, newRoomId, changeReason, operator = 'system') {
  const order = getOrderById(orderId)
  if (!order) return { success: false, error: '订单不存在' }
  
  const newRoomSql = 'SELECT * FROM rooms WHERE id = ?'
  const newRoom = getOne(newRoomSql, [newRoomId])
  if (!newRoom) return { success: false, error: '新房间不存在' }
  
  if (newRoom.status !== 'available') {
    return { success: false, error: '新房间不可用' }
  }
  
  const oldRoomId = order.room_id
  const priceAdjustment = (newRoom.price || 0) - (order.room_price || 0)
  
  const result = transaction(() => {
    const now = dayjs().format('YYYY-MM-DD HH:mm:ss')
    
    const updateOrderSql = `
      UPDATE orders 
      SET room_id = ?, 
          total_amount = total_amount + ?,
          updated_at = ?
      WHERE id = ?
    `
    runQuery(updateOrderSql, [newRoomId, priceAdjustment, now, orderId])
    
    const changeRecordSql = `
      INSERT INTO room_changes (order_id, old_room_id, new_room_id, change_reason, price_adjustment, changed_by, changed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
    runQuery(changeRecordSql, [orderId, oldRoomId, newRoomId, changeReason, priceAdjustment, operator, now])
    
    const updateOldRoomSql = `
      UPDATE rooms 
      SET status = 'cleaning', updated_at = ?
      WHERE id = ?
    `
    runQuery(updateOldRoomSql, [now, oldRoomId])
    
    const updateNewRoomSql = `
      UPDATE rooms 
      SET status = ?, updated_at = ?
      WHERE id = ?
    `
    const newStatus = order.status === 'checked_in' ? 'occupied' : 'available'
    runQuery(updateNewRoomSql, [newStatus, now, newRoomId])
  })
  
  return result.success ? { success: true, priceAdjustment } : { success: false, error: result.error }
}

function cancelOrder(orderId, cancelReason, operator = 'system') {
  const order = getOrderById(orderId)
  if (!order) return { success: false, error: '订单不存在' }
  
  if (!['pending', 'paid'].includes(order.status)) {
    return { success: false, error: '该订单状态无法取消' }
  }
  
  const result = transaction(() => {
    const now = dayjs().format('YYYY-MM-DD HH:mm:ss')
    
    updateOrderStatus(orderId, 'cancelled', operator, cancelReason)
    
    const updateRoomSql = `
      UPDATE rooms 
      SET status = 'available', updated_at = ?
      WHERE id = ?
    `
    runQuery(updateRoomSql, [now, order.room_id])
  })
  
  return result.success ? { success: true } : { success: false, error: result.error }
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
