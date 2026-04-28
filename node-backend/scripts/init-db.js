const Database = require('better-sqlite3')
const path = require('path')
const fs = require('fs')

const dbPath = path.join(__dirname, '../../database/hotel.db')
const schemaPath = path.join(__dirname, '../../database/schema.sql')

function initDatabase() {
  console.log('开始初始化数据库...')
  console.log(`数据库文件: ${dbPath}`)
  
  const dbDir = path.dirname(dbPath)
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true })
    console.log('创建数据库目录')
  }
  
  const db = new Database(dbPath)
  console.log('数据库连接成功')
  
  try {
    if (fs.existsSync(schemaPath)) {
      console.log('读取数据库 schema...')
      const schema = fs.readFileSync(schemaPath, 'utf-8')
      
      const statements = schema
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'))
      
      console.log(`执行 ${statements.length} 条 SQL 语句...`)
      
      const transaction = db.transaction(() => {
        statements.forEach((stmt, index) => {
          try {
            db.exec(stmt)
          } catch (error) {
            if (!error.message.includes('already exists')) {
              console.warn(`语句 ${index + 1} 执行警告:`, error.message)
            }
          }
        })
      })
      
      transaction()
      console.log('数据库 schema 初始化完成')
    } else {
      console.log('schema 文件不存在，跳过 schema 初始化')
    }
    
    insertInitialData(db)
    
    console.log('\n数据库初始化完成!')
    console.log(`数据库文件位置: ${dbPath}`)
    
  } catch (error) {
    console.error('数据库初始化失败:', error)
    process.exit(1)
  } finally {
    db.close()
  }
}

function insertInitialData(db) {
  console.log('\n检查初始数据...')
  
  const roomCount = db.prepare('SELECT COUNT(*) as count FROM rooms').get().count
  
  if (roomCount === 0) {
    console.log('插入初始房间数据...')
    
    const rooms = [
      { roomNumber: '101', type: '标准间', floor: 1, price: 198.00, maxGuests: 2, status: 'available', amenities: '["空调","电视","独立卫浴","WiFi","热水壶"]' },
      { roomNumber: '102', type: '标准间', floor: 1, price: 198.00, maxGuests: 2, status: 'available', amenities: '["空调","电视","独立卫浴","WiFi","热水壶"]' },
      { roomNumber: '103', type: '大床房', floor: 1, price: 258.00, maxGuests: 2, status: 'available', amenities: '["空调","电视","独立卫浴","WiFi","热水壶","迷你吧"]' },
      { roomNumber: '201', type: '商务间', floor: 2, price: 298.00, maxGuests: 2, status: 'available', amenities: '["空调","电视","独立卫浴","WiFi","热水壶","迷你吧","办公桌","保险箱"]' },
      { roomNumber: '202', type: '商务间', floor: 2, price: 298.00, maxGuests: 2, status: 'available', amenities: '["空调","电视","独立卫浴","WiFi","热水壶","迷你吧","办公桌","保险箱"]' },
      { roomNumber: '203', type: '豪华大床房', floor: 2, price: 388.00, maxGuests: 2, status: 'available', amenities: '["空调","电视","独立卫浴","WiFi","热水壶","迷你吧","浴缸","浴袍"]' },
      { roomNumber: '301', type: '套房', floor: 3, price: 588.00, maxGuests: 3, status: 'available', amenities: '["空调","电视","独立卫浴","WiFi","热水壶","迷你吧","浴缸","浴袍","客厅","厨房"]' },
      { roomNumber: '302', type: '总统套房', floor: 3, price: 1288.00, maxGuests: 4, status: 'available', amenities: '["空调","电视","独立卫浴","WiFi","热水壶","迷你吧","浴缸","浴袍","客厅","厨房","书房","会客厅"]' }
    ]
    
    const insertStmt = db.prepare(`
      INSERT INTO rooms (room_number, type, floor, price, max_guests, status, amenities, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `)
    
    rooms.forEach(room => {
      insertStmt.run(room.roomNumber, room.type, room.floor, room.price, room.maxGuests, room.status, room.amenities)
      console.log(`  - 房间 ${room.roomNumber} (${room.type}) - ¥${room.price}/晚`)
    })
    
    console.log('初始房间数据插入完成')
  } else {
    console.log(`数据库中已有 ${roomCount} 个房间，跳过初始数据插入`)
  }
}

initDatabase()
