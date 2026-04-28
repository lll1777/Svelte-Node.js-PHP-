const express = require('express')
const router = express.Router()
const paymentModel = require('../models/paymentModel')

router.get('/', (req, res) => {
  const { status, paymentMethod, orderId, startDate, endDate } = req.query
  const filters = {}
  
  if (status) filters.status = status
  if (paymentMethod) filters.paymentMethod = paymentMethod
  if (orderId) filters.orderId = parseInt(orderId)
  if (startDate) filters.startDate = startDate
  if (endDate) filters.endDate = endDate
  
  const payments = paymentModel.getPayments(filters)
  res.json({ success: true, data: payments })
})

router.get('/order/:orderId', (req, res) => {
  const payments = paymentModel.getPaymentsByOrderId(parseInt(req.params.orderId))
  res.json({ success: true, data: payments })
})

router.get('/:id', (req, res) => {
  const payment = paymentModel.getPaymentById(parseInt(req.params.id))
  if (!payment) {
    return res.status(404).json({ success: false, error: '支付记录不存在' })
  }
  res.json({ success: true, data: payment })
})

router.get('/number/:paymentNumber', (req, res) => {
  const payment = paymentModel.getPaymentByNumber(req.params.paymentNumber)
  if (!payment) {
    return res.status(404).json({ success: false, error: '支付记录不存在' })
  }
  res.json({ success: true, data: payment })
})

router.post('/', (req, res) => {
  const paymentData = req.body
  
  if (!paymentData.orderId || !paymentData.amount || !paymentData.paymentMethod) {
    return res.status(400).json({ success: false, error: '缺少必填字段' })
  }
  
  const payment = paymentModel.createPayment(paymentData)
  if (payment) {
    res.status(201).json({ success: true, data: payment })
  } else {
    res.status(500).json({ success: false, error: '创建支付记录失败' })
  }
})

router.patch('/:id/status', (req, res) => {
  const paymentId = parseInt(req.params.id)
  const { status, transactionId } = req.body
  
  if (!status) {
    return res.status(400).json({ success: false, error: '状态不能为空' })
  }
  
  const success = paymentModel.updatePaymentStatus(paymentId, status, transactionId)
  if (success) {
    res.json({ success: true })
  } else {
    res.status(404).json({ success: false, error: '支付记录不存在或更新失败' })
  }
})

router.post('/:id/refund', (req, res) => {
  const paymentId = parseInt(req.params.id)
  const { amount, reason } = req.body
  
  const result = paymentModel.processRefund(paymentId, { amount, reason })
  
  if (result.success) {
    res.json({ success: true, message: '退款成功', refundAmount: result.refundAmount })
  } else {
    res.status(400).json({ success: false, error: result.error })
  }
})

router.get('/summary/daily', (req, res) => {
  const { date } = req.query
  const summary = paymentModel.getDailyPaymentSummary(date)
  res.json({ success: true, data: summary })
})

module.exports = router
