const express = require('express')
const router = express.Router()
const orderModel = require('../models/orderModel')
const paymentModel = require('../models/paymentModel')

router.get('/', (req, res) => {
  const { status, guestName, roomId, checkInDate, checkOutDate } = req.query
  const filters = {}
  
  if (status) filters.status = status
  if (guestName) filters.guestName = guestName
  if (roomId) filters.roomId = parseInt(roomId)
  if (checkInDate) filters.checkInDate = checkInDate
  if (checkOutDate) filters.checkOutDate = checkOutDate
  
  const orders = orderModel.getOrders(filters)
  res.json({ success: true, data: orders })
})

router.get('/today', (req, res) => {
  const orders = orderModel.getTodayOrders()
  res.json({ success: true, data: orders })
})

router.get('/:id', (req, res) => {
  const order = orderModel.getOrderById(parseInt(req.params.id))
  if (!order) {
    return res.status(404).json({ success: false, error: '订单不存在' })
  }
  res.json({ success: true, data: order })
})

router.get('/number/:orderNumber', (req, res) => {
  const order = orderModel.getOrderByNumber(req.params.orderNumber)
  if (!order) {
    return res.status(404).json({ success: false, error: '订单不存在' })
  }
  res.json({ success: true, data: order })
})

router.post('/', (req, res) => {
  const orderData = req.body
  
  if (!orderData.roomId || !orderData.guestName || !orderData.guestPhone || 
      !orderData.checkInDate || !orderData.checkOutDate) {
    return res.status(400).json({ success: false, error: '缺少必填字段' })
  }
  
  const order = orderModel.createOrder(orderData)
  if (order) {
    res.status(201).json({ success: true, data: order })
  } else {
    res.status(500).json({ success: false, error: '创建订单失败' })
  }
})

router.patch('/:id/status', (req, res) => {
  const orderId = parseInt(req.params.id)
  const { status, changedBy, remark } = req.body
  
  if (!status) {
    return res.status(400).json({ success: false, error: '状态不能为空' })
  }
  
  const success = orderModel.updateOrderStatus(orderId, status, changedBy || 'system', remark)
  if (success) {
    res.json({ success: true })
  } else {
    res.status(404).json({ success: false, error: '订单不存在或更新失败' })
  }
})

router.post('/:id/checkin', (req, res) => {
  const orderId = parseInt(req.params.id)
  const result = orderModel.checkIn(orderId, req.body)
  
  if (result.success) {
    res.json({ success: true, message: '入住成功' })
  } else {
    res.status(400).json({ success: false, error: result.error })
  }
})

router.post('/:id/checkout', (req, res) => {
  const orderId = parseInt(req.params.id)
  const result = orderModel.checkOut(orderId, req.body)
  
  if (result.success) {
    res.json({ success: true, message: '退房成功' })
  } else {
    res.status(400).json({ success: false, error: result.error })
  }
})

router.post('/:id/change-room', (req, res) => {
  const orderId = parseInt(req.params.id)
  const { newRoomId, changeReason, operator } = req.body
  
  if (!newRoomId) {
    return res.status(400).json({ success: false, error: '请选择新房间' })
  }
  
  const result = orderModel.changeRoom(orderId, parseInt(newRoomId), changeReason, operator || 'system')
  
  if (result.success) {
    res.json({ success: true, message: '换房成功', priceAdjustment: result.priceAdjustment })
  } else {
    res.status(400).json({ success: false, error: result.error })
  }
})

router.post('/:id/cancel', (req, res) => {
  const orderId = parseInt(req.params.id)
  const { cancelReason, operator } = req.body
  
  const result = orderModel.cancelOrder(orderId, cancelReason, operator || 'system')
  
  if (result.success) {
    res.json({ success: true, message: '取消成功' })
  } else {
    res.status(400).json({ success: false, error: result.error })
  }
})

router.get('/:id/status-history', (req, res) => {
  const history = orderModel.getOrderStatusHistory(parseInt(req.params.id))
  res.json({ success: true, data: history })
})

router.get('/:id/payment-summary', (req, res) => {
  const summary = paymentModel.getOrderPaymentSummary(parseInt(req.params.id))
  if (!summary) {
    return res.status(404).json({ success: false, error: '订单不存在' })
  }
  res.json({ success: true, data: summary })
})

module.exports = router
