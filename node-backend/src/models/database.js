const Database = require('better-sqlite3')
const path = require('path')

const dbPath = path.join(__dirname, '../../../database/hotel.db')

let db

function initDatabase() {
  try {
    db = new Database(dbPath)
    console.log(`SQLite 数据库连接成功: ${dbPath}`)
    enableForeignKeys()
    return db
  } catch (error) {
    console.error('数据库连接失败:', error.message)
    process.exit(1)
  }
}

function enableForeignKeys() {
  db.exec('PRAGMA foreign_keys = ON')
}

function getDatabase() {
  if (!db) {
    initDatabase()
  }
  return db
}

function runQuery(sql, params = []) {
  const db = getDatabase()
  try {
    const result = db.prepare(sql).run(params)
    return { success: true, lastInsertRowid: result.lastInsertRowid, changes: result.changes }
  } catch (error) {
    console.error('SQL 执行错误:', error.message)
    console.error('SQL:', sql)
    console.error('Params:', params)
    return { success: false, error: error.message }
  }
}

function getOne(sql, params = []) {
  const db = getDatabase()
  try {
    const result = db.prepare(sql).get(params)
    return result || null
  } catch (error) {
    console.error('SQL 执行错误:', error.message)
    return null
  }
}

function getAll(sql, params = []) {
  const db = getDatabase()
  try {
    return db.prepare(sql).all(params)
  } catch (error) {
    console.error('SQL 执行错误:', error.message)
    return []
  }
}

function transaction(operations) {
  const db = getDatabase()
  const tx = db.transaction(operations)
  try {
    tx()
    return { success: true }
  } catch (error) {
    console.error('事务执行错误:', error.message)
    return { success: false, error: error.message }
  }
}

module.exports = {
  initDatabase,
  getDatabase,
  runQuery,
  getOne,
  getAll,
  transaction
}
