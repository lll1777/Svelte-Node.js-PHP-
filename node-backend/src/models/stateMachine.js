const ORDER_STATUSES = {
  PENDING: 'pending',
  PAID: 'paid',
  CHECKED_IN: 'checked_in',
  CHECKED_OUT: 'checked_out',
  CANCELLED: 'cancelled',
  REFUNDED: 'refunded'
}

const ROOM_STATUSES = {
  AVAILABLE: 'available',
  OCCUPIED: 'occupied',
  CLEANING: 'cleaning',
  MAINTENANCE: 'maintenance'
}

const ORDER_STATUS_TRANSITIONS = {
  [ORDER_STATUSES.PENDING]: {
    allowedTo: [ORDER_STATUSES.PAID, ORDER_STATUSES.CANCELLED],
    description: '待支付订单可支付或取消'
  },
  [ORDER_STATUSES.PAID]: {
    allowedTo: [ORDER_STATUSES.CHECKED_IN, ORDER_STATUSES.CANCELLED, ORDER_STATUSES.REFUNDED],
    description: '已支付订单可入住、取消或退款'
  },
  [ORDER_STATUSES.CHECKED_IN]: {
    allowedTo: [ORDER_STATUSES.CHECKED_OUT],
    description: '已入住订单只能退房，不可取消',
    isLocked: true
  },
  [ORDER_STATUSES.CHECKED_OUT]: {
    allowedTo: [],
    description: '已退房订单为终态，不可变更',
    isTerminal: true
  },
  [ORDER_STATUSES.CANCELLED]: {
    allowedTo: [],
    description: '已取消订单为终态，不可变更',
    isTerminal: true
  },
  [ORDER_STATUSES.REFUNDED]: {
    allowedTo: [],
    description: '已退款订单为终态，不可变更',
    isTerminal: true
  }
}

const LOCK_TYPES = {
  BOOKING: 'booking',
  MAINTENANCE: 'maintenance',
  TEMP: 'temp'
}

function canTransitionStatus(fromStatus, toStatus) {
  if (!fromStatus || !toStatus) {
    return { allowed: false, reason: '状态不能为空' }
  }
  
  const transitionRule = ORDER_STATUS_TRANSITIONS[fromStatus]
  
  if (!transitionRule) {
    return { allowed: false, reason: '未知的起始状态' }
  }
  
  if (transitionRule.isTerminal) {
    return { allowed: false, reason: `订单状态为${fromStatus}，为终态不可变更` }
  }
  
  if (transitionRule.isLocked && toStatus !== ORDER_STATUSES.CHECKED_OUT) {
    return { allowed: false, reason: `订单状态为${fromStatus}，锁定状态，只能执行退房操作` }
  }
  
  if (!transitionRule.allowedTo.includes(toStatus)) {
    return { 
      allowed: false, 
      reason: `不允许从状态[${fromStatus}]转换到[${toStatus}]，允许的转换为: [${transitionRule.allowedTo.join(', ')}]`
    }
  }
  
  return { allowed: true }
}

function isTerminalStatus(status) {
  const rule = ORDER_STATUS_TRANSITIONS[status]
  return rule ? rule.isTerminal === true : false
}

function isLockedStatus(status) {
  const rule = ORDER_STATUS_TRANSITIONS[status]
  return rule ? rule.isLocked === true : false
}

function validateOrderDates(checkInDate, checkOutDate) {
  if (!checkInDate || !checkOutDate) {
    return { valid: false, reason: '入住日期和退房日期不能为空' }
  }
  
  const checkIn = new Date(checkInDate)
  const checkOut = new Date(checkOutDate)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  if (isNaN(checkIn.getTime())) {
    return { valid: false, reason: '入住日期格式无效' }
  }
  
  if (isNaN(checkOut.getTime())) {
    return { valid: false, reason: '退房日期格式无效' }
  }
  
  if (checkIn >= checkOut) {
    return { valid: false, reason: '入住日期必须早于退房日期' }
  }
  
  const nights = Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24))
  
  return { 
    valid: true, 
    nights,
    checkInDate,
    checkOutDate
  }
}

function checkDateConflict(existingCheckIn, existingCheckOut, newCheckIn, newCheckOut) {
  const existingCI = new Date(existingCheckIn)
  const existingCO = new Date(existingCheckOut)
  const newCI = new Date(newCheckIn)
  const newCO = new Date(newCheckOut)
  
  const hasConflict = !(newCO <= existingCI || newCI >= existingCO)
  
  return hasConflict
}

function getStatusDisplayText(status) {
  const texts = {
    [ORDER_STATUSES.PENDING]: '待支付',
    [ORDER_STATUSES.PAID]: '已支付',
    [ORDER_STATUSES.CHECKED_IN]: '已入住',
    [ORDER_STATUSES.CHECKED_OUT]: '已退房',
    [ORDER_STATUSES.CANCELLED]: '已取消',
    [ORDER_STATUSES.REFUNDED]: '已退款'
  }
  return texts[status] || status
}

function getRoomStatusDisplayText(status) {
  const texts = {
    [ROOM_STATUSES.AVAILABLE]: '可用',
    [ROOM_STATUSES.OCCUPIED]: '已入住',
    [ROOM_STATUSES.CLEANING]: '清洁中',
    [ROOM_STATUSES.MAINTENANCE]: '维护中'
  }
  return texts[status] || status
}

module.exports = {
  ORDER_STATUSES,
  ROOM_STATUSES,
  LOCK_TYPES,
  ORDER_STATUS_TRANSITIONS,
  canTransitionStatus,
  isTerminalStatus,
  isLockedStatus,
  validateOrderDates,
  checkDateConflict,
  getStatusDisplayText,
  getRoomStatusDisplayText
}
