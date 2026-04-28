const express = require('express')
const cors = require('cors')
const path = require('path')
const { initDatabase } = require('./models/database')

const ordersRouter = require('./routes/orders')
const paymentsRouter = require('./routes/payments')
const reportsRouter = require('./routes/reports')

const app = express()
const PORT = process.env.PORT || 3001

initDatabase()

app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.get('/api/health', (req, res) => {
  res.json({ 
    success: true, 
    message: '酒店PMS系统 Node.js 后端运行正常',
    timestamp: new Date().toISOString()
  })
})

app.use('/api/orders', ordersRouter)
app.use('/api/payments', paymentsRouter)
app.use('/api/reports', reportsRouter)

app.use((err, req, res, next) => {
  console.error('错误:', err.stack)
  res.status(500).json({ 
    success: false, 
    error: '服务器内部错误',
    message: process.env.NODE_ENV === 'development' ? err.message : '请联系技术支持'
  })
})

app.use((req, res) => {
  res.status(404).json({ success: false, error: '接口不存在' })
})

app.listen(PORT, () => {
  console.log(`酒店PMS系统 Node.js 后端服务已启动`)
  console.log(`服务地址: http://localhost:${PORT}`)
  console.log(`API 路径: http://localhost:${PORT}/api`)
})
