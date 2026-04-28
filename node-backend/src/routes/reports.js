const express = require('express')
const router = express.Router()
const reportModel = require('../models/reportModel')
const dayjs = require('dayjs')

router.get('/dashboard', (req, res) => {
  const stats = reportModel.getDashboardStats()
  res.json({ success: true, data: stats })
})

router.get('/revenue', (req, res) => {
  const { startDate, endDate } = req.query
  
  const start = startDate || dayjs().subtract(30, 'day').format('YYYY-MM-DD')
  const end = endDate || dayjs().format('YYYY-MM-DD')
  
  const report = reportModel.getRevenueReport(start, end)
  res.json({ success: true, data: report, startDate: start, endDate: end })
})

router.get('/revenue/by-room-type', (req, res) => {
  const { startDate, endDate } = req.query
  
  const start = startDate || dayjs().subtract(30, 'day').format('YYYY-MM-DD')
  const end = endDate || dayjs().format('YYYY-MM-DD')
  
  const report = reportModel.getRevenueByRoomType(start, end)
  res.json({ success: true, data: report })
})

router.get('/order-status', (req, res) => {
  const { date } = req.query
  const targetDate = date || dayjs().format('YYYY-MM-DD')
  
  const summary = reportModel.getOrderStatusSummary(targetDate)
  res.json({ success: true, data: summary })
})

router.get('/checkin-out', (req, res) => {
  const { date } = req.query
  const targetDate = date || dayjs().format('YYYY-MM-DD')
  
  const summary = reportModel.getCheckInOutSummary(targetDate)
  res.json({ success: true, data: summary })
})

router.get('/payment-methods', (req, res) => {
  const { startDate, endDate } = req.query
  
  const start = startDate || dayjs().subtract(30, 'day').format('YYYY-MM-DD')
  const end = endDate || dayjs().format('YYYY-MM-DD')
  
  const stats = reportModel.getPaymentMethodStats(start, end)
  res.json({ success: true, data: stats })
})

router.get('/monthly/:year', (req, res) => {
  const year = parseInt(req.params.year)
  if (isNaN(year) || year < 2000 || year > 2100) {
    return res.status(400).json({ success: false, error: '无效的年份' })
  }
  
  const summary = reportModel.getMonthlyRevenueSummary(year)
  res.json({ success: true, data: summary })
})

module.exports = router
