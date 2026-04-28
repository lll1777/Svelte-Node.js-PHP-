const { getAll, runQuery, getOne } = require('./database')
const dayjs = require('dayjs')
const paymentModel = require('./paymentModel')

function getRevenueReport(startDate, endDate) {
  const sql = `
    SELECT 
      date(created_at) as date,
      COUNT(*) as total_orders,
      SUM(total_amount) as total_revenue,
      SUM(paid_amount) as total_paid,
      SUM(refund_amount) as total_refund
    FROM orders
    WHERE date(created_at) BETWEEN ? AND ?
    GROUP BY date(created_at)
    ORDER BY date
  `
  
  const results = getAll(sql, [startDate, endDate])
  
  return results.map(row => ({
    date: row.date,
    totalOrders: row.total_orders,
    totalRevenue: parseFloat(row.total_revenue) || 0,
    totalPaid: parseFloat(row.total_paid) || 0,
    totalRefund: parseFloat(row.total_refund) || 0,
    netRevenue: parseFloat(row.total_paid || 0) - parseFloat(row.total_refund || 0)
  }))
}

function getOrderStatusSummary(date) {
  const targetDate = date || dayjs().format('YYYY-MM-DD')
  
  const sql = `
    SELECT 
      status,
      COUNT(*) as count
    FROM orders
    WHERE date(created_at) = ?
    GROUP BY status
  `
  
  const results = getAll(sql, [targetDate])
  
  const summary = {
    date: targetDate,
    total: 0,
    byStatus: {}
  }
  
  results.forEach(row => {
    summary.byStatus[row.status] = row.count
    summary.total += row.count
  })
  
  return summary
}

function getCheckInOutSummary(date) {
  const targetDate = date || dayjs().format('YYYY-MM-DD')
  
  const checkInSql = `
    SELECT COUNT(*) as count
    FROM orders
    WHERE check_in_date = ?
  `
  
  const checkOutSql = `
    SELECT COUNT(*) as count
    FROM orders
    WHERE check_out_date = ?
  `
  
  const actualCheckInSql = `
    SELECT COUNT(*) as count
    FROM orders
    WHERE date(actual_check_in_time) = ?
  `
  
  const actualCheckOutSql = `
    SELECT COUNT(*) as count
    FROM orders
    WHERE date(actual_check_out_time) = ?
  `
  
  const scheduledCheckIns = getOne(checkInSql, [targetDate])?.count || 0
  const scheduledCheckOuts = getOne(checkOutSql, [targetDate])?.count || 0
  const actualCheckIns = getOne(actualCheckInSql, [targetDate])?.count || 0
  const actualCheckOuts = getOne(actualCheckOutSql, [targetDate])?.count || 0
  
  return {
    date: targetDate,
    scheduledCheckIns,
    scheduledCheckOuts,
    actualCheckIns,
    actualCheckOuts
  }
}

function getRevenueByRoomType(startDate, endDate) {
  const sql = `
    SELECT 
      r.type as room_type,
      COUNT(o.id) as total_orders,
      SUM(o.total_amount) as total_revenue,
      AVG(o.total_amount) as avg_order_value
    FROM orders o
    LEFT JOIN rooms r ON o.room_id = r.id
    WHERE date(o.created_at) BETWEEN ? AND ?
      AND o.status NOT IN ('cancelled', 'refunded')
    GROUP BY r.type
    ORDER BY total_revenue DESC
  `
  
  const results = getAll(sql, [startDate, endDate])
  
  return results.map(row => ({
    roomType: row.room_type,
    totalOrders: row.total_orders,
    totalRevenue: parseFloat(row.total_revenue) || 0,
    avgOrderValue: parseFloat(row.avg_order_value) || 0
  }))
}

function getPaymentMethodStats(startDate, endDate) {
  const sql = `
    SELECT 
      payment_method,
      status,
      COUNT(*) as count,
      SUM(amount) as total
    FROM payments
    WHERE date(created_at) BETWEEN ? AND ?
    GROUP BY payment_method, status
  `
  
  const results = getAll(sql, [startDate, endDate])
  
  const stats = {}
  
  results.forEach(row => {
    if (!stats[row.payment_method]) {
      stats[row.payment_method] = {
        total: 0,
        count: 0,
        byStatus: {}
      }
    }
    
    if (row.status === 'completed') {
      stats[row.payment_method].total += parseFloat(row.total) || 0
      stats[row.payment_method].count += row.count || 0
    }
    
    stats[row.payment_method].byStatus[row.status] = {
      count: row.count,
      total: parseFloat(row.total) || 0
    }
  })
  
  return stats
}

function getMonthlyRevenueSummary(year) {
  const sql = `
    SELECT 
      strftime('%Y-%m', created_at) as month,
      COUNT(*) as total_orders,
      SUM(total_amount) as total_revenue,
      SUM(paid_amount) as total_paid,
      SUM(refund_amount) as total_refund
    FROM orders
    WHERE strftime('%Y', created_at) = ?
      AND status NOT IN ('cancelled', 'refunded')
    GROUP BY strftime('%Y-%m', created_at)
    ORDER BY month
  `
  
  const results = getAll(sql, [year.toString()])
  
  const months = []
  for (let i = 1; i <= 12; i++) {
    const monthStr = `${year}-${i.toString().padStart(2, '0')}`
    const data = results.find(r => r.month === monthStr)
    months.push({
      month: monthStr,
      monthName: getMonthName(i),
      totalOrders: data?.total_orders || 0,
      totalRevenue: parseFloat(data?.total_revenue) || 0,
      totalPaid: parseFloat(data?.total_paid) || 0,
      netRevenue: parseFloat(data?.total_paid || 0) - parseFloat(data?.total_refund || 0)
    })
  }
  
  return months
}

function getMonthName(monthNum) {
  const names = ['一月', '二月', '三月', '四月', '五月', '六月', 
                 '七月', '八月', '九月', '十月', '十一月', '十二月']
  return names[monthNum - 1]
}

function getDashboardStats() {
  const today = dayjs().format('YYYY-MM-DD')
  const weekStart = dayjs().startOf('week').format('YYYY-MM-DD')
  const monthStart = dayjs().startOf('month').format('YYYY-MM-DD')
  
  const todayOrdersSql = `
    SELECT COUNT(*) as count, SUM(total_amount) as revenue
    FROM orders WHERE date(created_at) = ? AND status NOT IN ('cancelled', 'refunded')
  `
  
  const weekOrdersSql = `
    SELECT COUNT(*) as count, SUM(total_amount) as revenue
    FROM orders WHERE date(created_at) >= ? AND status NOT IN ('cancelled', 'refunded')
  `
  
  const todayCheckInSql = `
    SELECT COUNT(*) as count FROM orders WHERE check_in_date = ?
  `
  
  const todayCheckOutSql = `
    SELECT COUNT(*) as count FROM orders WHERE check_out_date = ?
  `
  
  const pendingOrdersSql = `
    SELECT COUNT(*) as count FROM orders WHERE status IN ('pending', 'paid')
  `
  
  const todayPaymentsSql = `
    SELECT SUM(amount) as total FROM payments WHERE date(created_at) = ? AND status = 'completed'
  `
  
  const todayOrders = getOne(todayOrdersSql, [today])
  const weekOrders = getOne(weekOrdersSql, [weekStart])
  const todayCheckIn = getOne(todayCheckInSql, [today])
  const todayCheckOut = getOne(todayCheckOutSql, [today])
  const pendingOrders = getOne(pendingOrdersSql, [])
  const todayPayments = getOne(todayPaymentsSql, [today])
  
  return {
    today: {
      orders: todayOrders?.count || 0,
      revenue: parseFloat(todayOrders?.revenue) || 0,
      payments: parseFloat(todayPayments?.total) || 0
    },
    week: {
      orders: weekOrders?.count || 0,
      revenue: parseFloat(weekOrders?.revenue) || 0
    },
    todayCheckIns: todayCheckIn?.count || 0,
    todayCheckOuts: todayCheckOut?.count || 0,
    pendingOrders: pendingOrders?.count || 0
  }
}

module.exports = {
  getRevenueReport,
  getOrderStatusSummary,
  getCheckInOutSummary,
  getRevenueByRoomType,
  getPaymentMethodStats,
  getMonthlyRevenueSummary,
  getDashboardStats
}
