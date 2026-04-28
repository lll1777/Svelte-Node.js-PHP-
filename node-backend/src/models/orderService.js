const { 
  ORDER_STATUSES, 
  ORDER_STATUS_TRANSITIONS,
  canTransitionStatus,
  isTerminalStatus,
  isLockedStatus,
  getStatusDisplayText
} = require('./stateMachine')

const ORDER_STATUS_LABELS = {
  [ORDER_STATUSES.PENDING]: '待支付',
  [ORDER_STATUSES.PAID]: '已支付',
  [ORDER_STATUSES.CHECKED_IN]: '已入住',
  [ORDER_STATUSES.CHECKED_OUT]: '已退房',
  [ORDER_STATUSES.CANCELLED]: '已取消',
  [ORDER_STATUSES.REFUNDED]: '已退款'
}

const CANCEL_ALLOWED_STATUSES = [
  ORDER_STATUSES.PENDING
]

const CHECKIN_ALLOWED_STATUSES = [
  ORDER_STATUSES.PAID
]

const CHECKOUT_ALLOWED_STATUSES = [
  ORDER_STATUSES.CHECKED_IN
]

const CHANGE_ROOM_ALLOWED_STATUSES = [
  ORDER_STATUSES.PAID,
  ORDER_STATUSES.CHECKED_IN
]

const REFUND_ALLOWED_STATUSES = [
  ORDER_STATUSES.PAID
]

function getStatusLabel(status) {
  return ORDER_STATUS_LABELS[status] || status
}

function canCancelOrder(order) {
  if (!order) {
    return { 
      allowed: false, 
      reason: '订单不存在', 
      errorCode: 'ORDER_NOT_FOUND' 
    }
  }

  if (isTerminalStatus(order.status)) {
    return { 
      allowed: false, 
      reason: `订单状态为 [${getStatusLabel(order.status)}]，为终态不可取消`, 
      errorCode: 'TERMINAL_ORDER' 
    }
  }

  if (isLockedStatus(order.status)) {
    return { 
      allowed: false, 
      reason: `订单状态为 [${getStatusLabel(order.status)}]，锁定状态不可取消，请先办理退房`, 
      errorCode: 'LOCKED_ORDER_CANCEL' 
    }
  }

  if (order.status === ORDER_STATUSES.PAID) {
    if ((order.paid_amount || 0) > 0) {
      return { 
        allowed: false, 
        reason: `订单已支付金额 ¥${order.paid_amount}，请先办理退款再取消订单`, 
        errorCode: 'PAID_ORDER_CANCEL',
        paidAmount: order.paid_amount
      }
    }
  }

  if (!CANCEL_ALLOWED_STATUSES.includes(order.status)) {
    return { 
      allowed: false, 
      reason: `订单状态为 [${getStatusLabel(order.status)}]，不允许取消`, 
      errorCode: 'INVALID_STATUS_FOR_CANCEL' 
    }
  }

  return { allowed: true }
}

function canCheckIn(order, currentDate) {
  if (!order) {
    return { 
      allowed: false, 
      reason: '订单不存在', 
      errorCode: 'ORDER_NOT_FOUND' 
    }
  }

  if (isTerminalStatus(order.status)) {
    return { 
      allowed: false, 
      reason: `订单状态为 [${getStatusLabel(order.status)}]，为终态不可操作`, 
      errorCode: 'TERMINAL_ORDER' 
    }
  }

  if (!CHECKIN_ALLOWED_STATUSES.includes(order.status)) {
    return { 
      allowed: false, 
      reason: `订单状态为 [${getStatusLabel(order.status)}]，必须是已支付状态才能办理入住`, 
      errorCode: 'INVALID_STATUS_FOR_CHECKIN' 
    }
  }

  if (currentDate) {
    const checkInDate = new Date(order.check_in_date)
    const today = new Date(currentDate)
    today.setHours(0, 0, 0, 0)
    checkInDate.setHours(0, 0, 0, 0)
    
    if (today < checkInDate) {
      const formatDate = (d) => {
        return d.toISOString().split('T')[0]
      }
      return { 
        allowed: false, 
        reason: `入住日期为 ${formatDate(checkInDate)}，提前入住请联系前台`, 
        errorCode: 'EARLY_CHECKIN' 
      }
    }
  }

  return { allowed: true }
}

function canCheckOut(order) {
  if (!order) {
    return { 
      allowed: false, 
      reason: '订单不存在', 
      errorCode: 'ORDER_NOT_FOUND' 
    }
  }

  if (isTerminalStatus(order.status)) {
    return { 
      allowed: false, 
      reason: `订单状态为 [${getStatusLabel(order.status)}]，为终态不可操作`, 
      errorCode: 'TERMINAL_ORDER' 
    }
  }

  if (!CHECKOUT_ALLOWED_STATUSES.includes(order.status)) {
    return { 
      allowed: false, 
      reason: `订单状态为 [${getStatusLabel(order.status)}]，必须是已入住状态才能办理退房`, 
      errorCode: 'INVALID_STATUS_FOR_CHECKOUT' 
    }
  }

  const balance = (order.total_amount || 0) - (order.paid_amount || 0) + (order.refund_amount || 0)
  if (balance > 0.01) {
    return { 
      allowed: false, 
      reason: `订单还有未结清金额 ¥${balance.toFixed(2)}，请先完成支付`, 
      errorCode: 'OUTSTANDING_BALANCE',
      balance: balance
    }
  }

  return { allowed: true }
}

function canChangeRoom(order) {
  if (!order) {
    return { 
      allowed: false, 
      reason: '订单不存在', 
      errorCode: 'ORDER_NOT_FOUND' 
    }
  }

  if (isTerminalStatus(order.status)) {
    return { 
      allowed: false, 
      reason: `订单状态为 [${getStatusLabel(order.status)}]，为终态不可操作`, 
      errorCode: 'TERMINAL_ORDER' 
    }
  }

  if (!CHANGE_ROOM_ALLOWED_STATUSES.includes(order.status)) {
    return { 
      allowed: false, 
      reason: `订单状态为 [${getStatusLabel(order.status)}]，不允许换房`, 
      errorCode: 'INVALID_STATUS_FOR_CHANGE_ROOM' 
    }
  }

  return { allowed: true }
}

function canRefund(order) {
  if (!order) {
    return { 
      allowed: false, 
      reason: '订单不存在', 
      errorCode: 'ORDER_NOT_FOUND' 
    }
  }

  if (isTerminalStatus(order.status)) {
    return { 
      allowed: false, 
      reason: `订单状态为 [${getStatusLabel(order.status)}]，为终态不可操作`, 
      errorCode: 'TERMINAL_ORDER' 
    }
  }

  if (isLockedStatus(order.status)) {
    return { 
      allowed: false, 
      reason: `订单状态为 [${getStatusLabel(order.status)}]，锁定状态不可退款，请先办理退房`, 
      errorCode: 'LOCKED_ORDER_REFUND' 
    }
  }

  if (!REFUND_ALLOWED_STATUSES.includes(order.status)) {
    return { 
      allowed: false, 
      reason: `订单状态为 [${getStatusLabel(order.status)}]，不允许退款`, 
      errorCode: 'INVALID_STATUS_FOR_REFUND' 
    }
  }

  if ((order.paid_amount || 0) <= 0) {
    return { 
      allowed: false, 
      reason: '订单没有支付金额，无法退款', 
      errorCode: 'NO_PAYMENT_TO_REFUND' 
    }
  }

  return { allowed: true }
}

function canUpdateStatus(order, newStatus) {
  if (!order) {
    return { 
      allowed: false, 
      reason: '订单不存在', 
      errorCode: 'ORDER_NOT_FOUND' 
    }
  }

  if (order.status === newStatus) {
    return { allowed: true, skipped: true, reason: '状态未改变' }
  }

  if (isTerminalStatus(order.status)) {
    return { 
      allowed: false, 
      reason: `订单状态为 [${getStatusLabel(order.status)}]，为终态不可变更`, 
      errorCode: 'TERMINAL_ORDER' 
    }
  }

  if (isLockedStatus(order.status)) {
    if (newStatus !== ORDER_STATUSES.CHECKED_OUT) {
      return { 
        allowed: false, 
        reason: `订单状态为 [${getStatusLabel(order.status)}]，锁定状态，只能执行退房操作`, 
        errorCode: 'LOCKED_ORDER_STATUS_CHANGE' 
      }
    }
  }

  const transitionCheck = canTransitionStatus(order.status, newStatus)
  if (!transitionCheck.allowed) {
    return { 
      allowed: false, 
      reason: transitionCheck.reason, 
      errorCode: 'STATUS_TRANSITION_DENIED',
      fromStatus: order.status,
      toStatus: newStatus
    }
  }

  return { allowed: true }
}

function getOrderActionPermissions(order) {
  if (!order) {
    return {
      canView: true,
      canEdit: false,
      canCancel: false,
      canCheckIn: false,
      canCheckOut: false,
      canChangeRoom: false,
      canRefund: false,
      canUpdateStatus: false
    }
  }

  const cancelCheck = canCancelOrder(order)
  const checkInCheck = canCheckIn(order)
  const checkOutCheck = canCheckOut(order)
  const changeRoomCheck = canChangeRoom(order)
  const refundCheck = canRefund(order)

  return {
    canView: true,
    canEdit: !isTerminalStatus(order.status) && !isLockedStatus(order.status),
    canCancel: cancelCheck.allowed,
    cancelReason: cancelCheck.reason,
    cancelErrorCode: cancelCheck.errorCode,
    canCheckIn: checkInCheck.allowed,
    checkInReason: checkInCheck.reason,
    checkInErrorCode: checkInCheck.errorCode,
    canCheckOut: checkOutCheck.allowed,
    checkOutReason: checkOutCheck.reason,
    checkOutErrorCode: checkOutCheck.errorCode,
    canChangeRoom: changeRoomCheck.allowed,
    changeRoomReason: changeRoomCheck.reason,
    changeRoomErrorCode: changeRoomCheck.errorCode,
    canRefund: refundCheck.allowed,
    refundReason: refundCheck.reason,
    refundErrorCode: refundCheck.errorCode,
    isTerminal: isTerminalStatus(order.status),
    isLocked: isLockedStatus(order.status),
    statusLabel: getStatusLabel(order.status)
  }
}

module.exports = {
  CANCEL_ALLOWED_STATUSES,
  CHECKIN_ALLOWED_STATUSES,
  CHECKOUT_ALLOWED_STATUSES,
  CHANGE_ROOM_ALLOWED_STATUSES,
  REFUND_ALLOWED_STATUSES,
  getStatusLabel,
  canCancelOrder,
  canCheckIn,
  canCheckOut,
  canChangeRoom,
  canRefund,
  canUpdateStatus,
  getOrderActionPermissions
}
