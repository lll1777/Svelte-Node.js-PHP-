const { runQuery, getOne, getAll, transaction } = require('./database')
const dayjs = require('dayjs')
const { v4: uuidv4 } = require('uuid')
const orderModel = require('./orderModel')

function generatePaymentNumber() {
  const date = dayjs().format('YYYYMMDD')
  const random = Math.random().toString(36).substring(2, 8).toUpperCase()
  return `PY${date}${random}`
}

function createPayment(paymentData) {
  const paymentNumber = generatePaymentNumber()
  
  const sql = `
    INSERT INTO payments (
      payment_number, order_id, amount, payment_method, status,
      transaction_id, paid_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `
  
  const now = dayjs().format('YYYY-MM-DD HH:mm:ss')
  const params = [
    paymentNumber,
    paymentData.orderId,
    paymentData.amount,
    paymentData.paymentMethod,
    paymentData.status || 'pending',
    paymentData.transactionId || null,
    paymentData.paidAt || now,
    now
  ]
  
  const result = runQuery(sql, params)
  
  if (result.success) {
    if (paymentData.status === 'completed') {
      updateOrderPaymentStatus(paymentData.orderId, paymentData.amount)
    }
    return getPaymentById(result.lastInsertRowid)
  }
  
  return null
}

function updateOrderPaymentStatus(orderId, amount) {
  const order = orderModel.getOrderById(orderId)
  if (!order) return false
  
  const newPaidAmount = (order.paid_amount || 0) + amount
  const status = newPaidAmount >= order.total_amount ? 'paid' : order.status
  
  const sql = `
    UPDATE orders 
    SET paid_amount = ?, status = ?, updated_at = ?
    WHERE id = ?
  `
  const now = dayjs().format('YYYY-MM-DD HH:mm:ss')
  const result = runQuery(sql, [newPaidAmount, status, now, orderId])
  
  return result.success
}

function getPaymentById(paymentId) {
  const sql = `
    SELECT p.*, 
           o.order_number, o.guest_name, o.total_amount
    FROM payments p
    LEFT JOIN orders o ON p.order_id = o.id
    WHERE p.id = ?
  `
  return getOne(sql, [paymentId])
}

function getPaymentByNumber(paymentNumber) {
  const sql = `
    SELECT p.*, 
           o.order_number, o.guest_name, o.total_amount
    FROM payments p
    LEFT JOIN orders o ON p.order_id = o.id
    WHERE p.payment_number = ?
  `
  return getOne(sql, [paymentNumber])
}

function getPaymentsByOrderId(orderId) {
  const sql = `
    SELECT p.*, 
           o.order_number, o.guest_name
    FROM payments p
    LEFT JOIN orders o ON p.order_id = o.id
    WHERE p.order_id = ?
    ORDER BY p.created_at DESC
  `
  return getAll(sql, [orderId])
}

function getPayments(filters = {}) {
  let sql = `
    SELECT p.*, 
           o.order_number, o.guest_name, o.total_amount
    FROM payments p
    LEFT JOIN orders o ON p.order_id = o.id
    WHERE 1=1
  `
  const params = []
  
  if (filters.status) {
    sql += ' AND p.status = ?'
    params.push(filters.status)
  }
  if (filters.paymentMethod) {
    sql += ' AND p.payment_method = ?'
    params.push(filters.paymentMethod)
  }
  if (filters.orderId) {
    sql += ' AND p.order_id = ?'
    params.push(filters.orderId)
  }
  if (filters.startDate) {
    sql += ' AND date(p.created_at) >= ?'
    params.push(filters.startDate)
  }
  if (filters.endDate) {
    sql += ' AND date(p.created_at) <= ?'
    params.push(filters.endDate)
  }
  
  sql += ' ORDER BY p.created_at DESC'
  
  return getAll(sql, params)
}

function updatePaymentStatus(paymentId, newStatus, transactionId = null) {
  const payment = getPaymentById(paymentId)
  if (!payment) return false
  
  const sql = `
    UPDATE payments 
    SET status = ?, transaction_id = ?, paid_at = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `
  const now = dayjs().format('YYYY-MM-DD HH:mm:ss')
  const params = [newStatus, transactionId || payment.transaction_id, now, paymentId]
  
  const result = runQuery(sql, params)
  
  if (result.success && newStatus === 'completed') {
    updateOrderPaymentStatus(payment.order_id, payment.amount)
  }
  
  return result.success
}

function processRefund(paymentId, refundData) {
  const payment = getPaymentById(paymentId)
  if (!payment) return { success: false, error: '支付记录不存在' }
  
  if (payment.status !== 'completed') {
    return { success: false, error: '该支付未完成，无法退款' }
  }
  
  const refundAmount = refundData.amount || payment.amount
  if (refundAmount > payment.amount) {
    return { success: false, error: '退款金额不能大于支付金额' }
  }
  
  const result = transaction(() => {
    const now = dayjs().format('YYYY-MM-DD HH:mm:ss')
    
    const updatePaymentSql = `
      UPDATE payments 
      SET status = 'refunded', refunded_at = ?, refund_reason = ?
      WHERE id = ?
    `
    runQuery(updatePaymentSql, [now, refundData.reason || null, paymentId])
    
    const updateOrderSql = `
      UPDATE orders 
      SET refund_amount = refund_amount + ?,
          updated_at = ?
      WHERE id = ?
    `
    runQuery(updateOrderSql, [refundAmount, now, payment.order_id])
    
    const order = orderModel.getOrderById(payment.order_id)
    const newPaidAmount = (order.paid_amount || 0) - refundAmount
    
    if (newPaidAmount <= 0) {
      orderModel.updateOrderStatus(payment.order_id, 'refunded', 'system', `退款金额: ¥${refundAmount}`)
    }
  })
  
  return result.success ? { success: true, refundAmount } : { success: false, error: result.error }
}

function getOrderPaymentSummary(orderId) {
  const order = orderModel.getOrderById(orderId)
  if (!order) return null
  
  const payments = getPaymentsByOrderId(orderId)
  
  const totalPaid = payments
    .filter(p => p.status === 'completed')
    .reduce((sum, p) => sum + (p.amount || 0), 0)
  
  const totalRefunded = payments
    .filter(p => p.status === 'refunded')
    .reduce((sum, p) => sum + (p.amount || 0), 0)
  
  return {
    orderId,
    orderNumber: order.order_number,
    totalAmount: order.total_amount,
    totalPaid,
    totalRefunded,
    balance: totalAmount - totalPaid + totalRefunded,
    payments
  }
}

function getDailyPaymentSummary(date) {
  const targetDate = date || dayjs().format('YYYY-MM-DD')
  
  const sql = `
    SELECT 
      payment_method,
      status,
      COUNT(*) as count,
      SUM(amount) as total
    FROM payments
    WHERE date(created_at) = ?
    GROUP BY payment_method, status
  `
  
  const results = getAll(sql, [targetDate])
  
  const summary = {
    date: targetDate,
    total: 0,
    byMethod: {},
    byStatus: {}
  }
  
  results.forEach(item => {
    if (item.status === 'completed') {
      summary.total += item.total || 0
    }
    
    if (!summary.byMethod[item.payment_method]) {
      summary.byMethod[item.payment_method] = { count: 0, total: 0 }
    }
    summary.byMethod[item.payment_method].count += item.count || 0
    if (item.status === 'completed') {
      summary.byMethod[item.payment_method].total += item.total || 0
    }
    
    if (!summary.byStatus[item.status]) {
      summary.byStatus[item.status] = { count: 0, total: 0 }
    }
    summary.byStatus[item.status].count += item.count || 0
    summary.byStatus[item.status].total += item.total || 0
  })
  
  return summary
}

module.exports = {
  generatePaymentNumber,
  createPayment,
  getPaymentById,
  getPaymentByNumber,
  getPaymentsByOrderId,
  getPayments,
  updatePaymentStatus,
  processRefund,
  getOrderPaymentSummary,
  getDailyPaymentSummary
}
