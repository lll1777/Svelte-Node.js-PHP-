<script>
  import { onMount } from 'svelte'
  import dayjs from 'dayjs'
  import { orderApi, roomApi, paymentApi } from '../api.js'

  let loading = false
  let rooms = []
  let bookingForm = {
    guestName: '',
    guestPhone: '',
    guestIdCard: '',
    roomId: null,
    checkInDate: dayjs().format('YYYY-MM-DD'),
    checkOutDate: dayjs().add(1, 'day').format('YYYY-MM-DD'),
    guestCount: 1,
    specialRequests: ''
  }
  let availableRooms = []
  let selectedRoom = null
  let showPaymentModal = false
  let currentOrder = null
  let notification = null

  onMount(async () => {
    await loadRooms()
  })

  async function loadRooms() {
    try {
      loading = true
      const response = await roomApi.list()
      rooms = response.data.data || []
      await checkAvailability()
    } catch (error) {
      console.error('加载房间失败:', error)
      showNotification('加载房间失败', 'error')
    } finally {
      loading = false
    }
  }

  async function checkAvailability() {
    try {
      const params = {
        checkInDate: bookingForm.checkInDate,
        checkOutDate: bookingForm.checkOutDate
      }
      const response = await roomApi.getAvailability(params)
      availableRooms = response.data.data || []
    } catch (error) {
      console.error('检查可用性失败:', error)
    }
  }

  $: {
    if (bookingForm.checkInDate && bookingForm.checkOutDate) {
      checkAvailability()
    }
  }

  $: {
    if (bookingForm.roomId) {
      selectedRoom = rooms.find(r => r.id === bookingForm.roomId)
    } else {
      selectedRoom = null
    }
  }

  function calculatePrice() {
    if (!selectedRoom || !bookingForm.checkInDate || !bookingForm.checkOutDate) {
      return 0
    }
    const checkIn = dayjs(bookingForm.checkInDate)
    const checkOut = dayjs(bookingForm.checkOutDate)
    const nights = checkOut.diff(checkIn, 'day')
    if (nights <= 0) return 0
    return selectedRoom.price * nights
  }

  $: totalPrice = calculatePrice()

  async function handleSubmit() {
    if (!bookingForm.guestName || !bookingForm.guestPhone || !bookingForm.roomId) {
      showNotification('请填写必填信息', 'error')
      return
    }
    if (totalPrice <= 0) {
      showNotification('入住日期无效', 'error')
      return
    }

    try {
      loading = true
      const orderData = {
        ...bookingForm,
        totalAmount: totalPrice,
        status: 'pending',
        createdAt: dayjs().format('YYYY-MM-DD HH:mm:ss')
      }
      const response = await orderApi.create(orderData)
      currentOrder = response.data.data
      showPaymentModal = true
      showNotification('预订成功，等待支付', 'success')
    } catch (error) {
      console.error('创建订单失败:', error)
      showNotification('创建订单失败', 'error')
    } finally {
      loading = false
    }
  }

  async function handlePayment(paymentMethod) {
    if (!currentOrder) return

    try {
      loading = true
      const paymentData = {
        orderId: currentOrder.id,
        amount: currentOrder.totalAmount,
        paymentMethod: paymentMethod,
        status: 'completed',
        paidAt: dayjs().format('YYYY-MM-DD HH:mm:ss')
      }
      await paymentApi.createPayment(paymentData)
      await orderApi.updateStatus(currentOrder.id, 'paid')
      showNotification('支付成功！', 'success')
      showPaymentModal = false
      resetForm()
      await loadRooms()
    } catch (error) {
      console.error('支付失败:', error)
      showNotification('支付失败', 'error')
    } finally {
      loading = false
    }
  }

  function resetForm() {
    bookingForm = {
      guestName: '',
      guestPhone: '',
      guestIdCard: '',
      roomId: null,
      checkInDate: dayjs().format('YYYY-MM-DD'),
      checkOutDate: dayjs().add(1, 'day').format('YYYY-MM-DD'),
      guestCount: 1,
      specialRequests: ''
    }
    currentOrder = null
  }

  function showNotification(message, type) {
    notification = { message, type }
    setTimeout(() => {
      notification = null
    }, 3000)
  }

  function getRoomStatusBadge(room) {
    const isAvailable = availableRooms.some(r => r.id === room.id)
    if (room.status === 'maintenance') {
      return { text: '维护中', class: 'badge-maintenance' }
    }
    if (room.status === 'cleaning') {
      return { text: '清洁中', class: 'badge-cleaning' }
    }
    if (!isAvailable) {
      return { text: '已占用', class: 'badge-occupied' }
    }
    return { text: '可预订', class: 'badge-available' }
  }

  function isRoomAvailable(room) {
    return room.status === 'available' && availableRooms.some(r => r.id === room.id)
  }
</script>

<div class="booking-page">
  {#if notification}
    <div class={`notification ${notification.type}`}>
      {notification.message}
    </div>
  {/if}

  <h2>📅 预订管理</h2>
  
  <div class="booking-container">
    <div class="booking-form">
      <h3>预订信息</h3>
      
      <div class="form-group">
        <label>入住日期</label>
        <input 
          type="date" 
          bind:value={bookingForm.checkInDate}
          min={dayjs().format('YYYY-MM-DD')}
        />
      </div>
      
      <div class="form-group">
        <label>退房日期</label>
        <input 
          type="date" 
          bind:value={bookingForm.checkOutDate}
          min={bookingForm.checkInDate}
        />
      </div>
      
      <div class="form-group">
        <label>客人姓名</label>
        <input 
          type="text" 
          bind:value={bookingForm.guestName}
          placeholder="请输入客人姓名"
        />
      </div>
      
      <div class="form-group">
        <label>联系电话</label>
        <input 
          type="tel" 
          bind:value={bookingForm.guestPhone}
          placeholder="请输入联系电话"
        />
      </div>
      
      <div class="form-group">
        <label>身份证号</label>
        <input 
          type="text" 
          bind:value={bookingForm.guestIdCard}
          placeholder="请输入身份证号"
        />
      </div>
      
      <div class="form-group">
        <label>入住人数</label>
        <select bind:value={bookingForm.guestCount}>
          {#each [1, 2, 3, 4, 5] as count}
            <option value={count}>{count} 人</option>
          {/each}
        </select>
      </div>
      
      <div class="form-group">
        <label>特殊要求</label>
        <textarea 
          bind:value={bookingForm.specialRequests}
          placeholder="如有特殊要求请备注"
          rows="3"
        ></textarea>
      </div>

      {#if selectedRoom}
        <div class="price-summary">
          <h4>价格明细</h4>
          <p>房间: {selectedRoom.roomNumber} ({selectedRoom.type})</p>
          <p>单价: ¥{selectedRoom.price}/晚</p>
          <p>房晚数: {dayjs(bookingForm.checkOutDate).diff(dayjs(bookingForm.checkInDate), 'day')} 晚</p>
          <p class="total">总价: ¥{totalPrice}</p>
        </div>
      {/if}
      
      <button 
        class="btn-primary"
        on:click={handleSubmit}
        disabled={loading || !selectedRoom || totalPrice <= 0}
      >
        {loading ? '处理中...' : '确认预订'}
      </button>
    </div>
    
    <div class="room-list">
      <h3>可预订房间</h3>
      
      {#if loading && rooms.length === 0}
        <div class="loading">加载中...</div>
      {:else if rooms.length === 0}
        <div class="empty">暂无房间数据</div>
      {:else}
        <div class="rooms">
          {#each rooms as room}
            {@const badge = getRoomStatusBadge(room)}
            {@const available = isRoomAvailable(room)}
            <div 
              class={`room-card ${available ? '' : 'disabled'} ${bookingForm.roomId === room.id ? 'selected' : ''}`}
              on:click={() => available && (bookingForm.roomId = room.id)}
            >
              <div class="room-header">
                <span class="room-number">{room.roomNumber}</span>
                <span class={`badge ${badge.class}`}>{badge.text}</span>
              </div>
              <div class="room-info">
                <p class="room-type">{room.type}</p>
                <p class="room-price">¥{room.price}/晚</p>
                <p class="room-floor">楼层: {room.floor}层</p>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>

  {#if showPaymentModal && currentOrder}
    <div class="modal-overlay">
      <div class="modal">
        <div class="modal-header">
          <h3>订单支付</h3>
          <button class="close" on:click={() => showPaymentModal = false}>×</button>
        </div>
        <div class="modal-body">
          <div class="payment-info">
            <p><strong>订单号:</strong> {currentOrder.id}</p>
            <p><strong>房间:</strong> {selectedRoom?.roomNumber}</p>
            <p><strong>入住:</strong> {currentOrder.checkInDate}</p>
            <p><strong>退房:</strong> {currentOrder.checkOutDate}</p>
            <p class="payment-amount"><strong>支付金额:</strong> ¥{currentOrder.totalAmount}</p>
          </div>
          
          <div class="payment-methods">
            <h4>选择支付方式</h4>
            <div class="methods">
              <button 
                class="method-btn"
                on:click={() => handlePayment('wechat')}
                disabled={loading}
              >
                🟢 微信支付
              </button>
              <button 
                class="method-btn"
                on:click={() => handlePayment('alipay')}
                disabled={loading}
              >
                🔵 支付宝
              </button>
              <button 
                class="method-btn"
                on:click={() => handlePayment('cash')}
                disabled={loading}
              >
                💵 现金支付
              </button>
              <button 
                class="method-btn"
                on:click={() => handlePayment('card')}
                disabled={loading}
              >
                💳 银行卡
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .booking-page {
    max-width: 1400px;
    margin: 0 auto;
  }
  h2 {
    margin-bottom: 20px;
    color: #333;
  }
  .notification {
    padding: 15px;
    border-radius: 5px;
    margin-bottom: 20px;
    animation: slideIn 0.3s ease;
  }
  .notification.success {
    background: #d4edda;
    color: #155724;
    border: 1px solid #c3e6cb;
  }
  .notification.error {
    background: #f8d7da;
    color: #721c24;
    border: 1px solid #f5c6cb;
  }
  @keyframes slideIn {
    from { opacity: 0; transform: translateY(-10px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .booking-container {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 30px;
  }
  @media (max-width: 900px) {
    .booking-container {
      grid-template-columns: 1fr;
    }
  }
  .booking-form, .room-list {
    background: white;
    padding: 25px;
    border-radius: 10px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
  }
  h3 {
    margin-bottom: 20px;
    color: #1e3c72;
    border-bottom: 2px solid #e0e0e0;
    padding-bottom: 10px;
  }
  .form-group {
    margin-bottom: 15px;
  }
  .form-group label {
    display: block;
    margin-bottom: 5px;
    font-weight: 500;
    color: #555;
  }
  .form-group input,
  .form-group select,
  .form-group textarea {
    width: 100%;
    padding: 12px;
    border: 1px solid #ddd;
    border-radius: 5px;
    font-size: 14px;
    transition: border-color 0.3s;
  }
  .form-group input:focus,
  .form-group select:focus,
  .form-group textarea:focus {
    outline: none;
    border-color: #2a5298;
  }
  .price-summary {
    background: #f8f9fa;
    padding: 15px;
    border-radius: 8px;
    margin: 20px 0;
  }
  .price-summary h4 {
    margin-bottom: 10px;
    color: #1e3c72;
  }
  .price-summary p {
    margin: 5px 0;
    color: #666;
  }
  .price-summary .total {
    font-size: 18px;
    font-weight: bold;
    color: #e74c3c;
    margin-top: 10px;
  }
  .btn-primary {
    width: 100%;
    padding: 15px;
    background: linear-gradient(135deg, #1e3c72, #2a5298);
    color: white;
    border: none;
    border-radius: 5px;
    font-size: 16px;
    font-weight: 500;
    cursor: pointer;
    transition: transform 0.2s, box-shadow 0.2s;
  }
  .btn-primary:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 4px 15px rgba(30, 60, 114, 0.4);
  }
  .btn-primary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .rooms {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 15px;
  }
  .room-card {
    background: #f8f9fa;
    border: 2px solid transparent;
    border-radius: 8px;
    padding: 15px;
    cursor: pointer;
    transition: all 0.3s ease;
  }
  .room-card:hover:not(.disabled) {
    background: #e9ecef;
    transform: translateY(-2px);
  }
  .room-card.selected {
    border-color: #2a5298;
    background: #e8f4ff;
  }
  .room-card.disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .room-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
  }
  .room-number {
    font-size: 18px;
    font-weight: bold;
    color: #1e3c72;
  }
  .badge {
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 500;
  }
  .badge-available {
    background: #d4edda;
    color: #155724;
  }
  .badge-occupied {
    background: #f8d7da;
    color: #721c24;
  }
  .badge-maintenance {
    background: #fff3cd;
    color: #856404;
  }
  .badge-cleaning {
    background: #e2e3e5;
    color: #383d41;
  }
  .room-info p {
    margin: 3px 0;
    font-size: 13px;
    color: #666;
  }
  .room-type {
    font-weight: 500;
    color: #333 !important;
  }
  .room-price {
    font-size: 16px !important;
    font-weight: bold;
    color: #e74c3c !important;
  }
  .loading, .empty {
    text-align: center;
    padding: 40px;
    color: #999;
  }
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0,0,0,0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }
  .modal {
    background: white;
    border-radius: 10px;
    width: 90%;
    max-width: 500px;
    max-height: 90vh;
    overflow-y: auto;
  }
  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px;
    border-bottom: 1px solid #eee;
  }
  .modal-header h3 {
    margin: 0;
    border: none;
    padding: 0;
  }
  .close {
    background: none;
    border: none;
    font-size: 24px;
    cursor: pointer;
    color: #999;
  }
  .close:hover {
    color: #333;
  }
  .modal-body {
    padding: 20px;
  }
  .payment-info {
    margin-bottom: 20px;
  }
  .payment-info p {
    margin: 8px 0;
    color: #555;
  }
  .payment-amount {
    font-size: 18px;
    color: #e74c3c !important;
    margin-top: 15px !important;
    padding-top: 15px;
    border-top: 1px solid #eee;
  }
  .payment-methods h4 {
    margin-bottom: 15px;
    color: #333;
  }
  .methods {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .method-btn {
    padding: 15px;
    border: 2px solid #ddd;
    border-radius: 8px;
    background: white;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.3s;
  }
  .method-btn:hover:not(:disabled) {
    border-color: #2a5298;
    background: #f0f7ff;
  }
</style>
