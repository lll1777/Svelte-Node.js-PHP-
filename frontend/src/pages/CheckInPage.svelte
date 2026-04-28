<script>
  import { onMount } from 'svelte'
  import dayjs from 'dayjs'
  import { orderApi, roomApi } from '../api.js'

  let loading = false
  let todayOrders = []
  let checkInOrders = []
  let checkOutOrders = []
  let rooms = []
  let selectedOrder = null
  let showChangeRoom = false
  let showOrderDetail = false
  let newRoomId = null
  let changeReason = ''
  let notification = null

  onMount(() => {
    loadData()
  })

  async function loadData() {
    try {
      loading = true
      
      const [ordersResponse, roomsResponse] = await Promise.all([
        orderApi.list({}),
        roomApi.list({})
      ])
      
      todayOrders = ordersResponse.data.data || []
      rooms = roomsResponse.data.data || []
      
      const today = dayjs().format('YYYY-MM-DD')
      checkInOrders = todayOrders.filter(o => 
        o.check_in_date === today && ['pending', 'paid'].includes(o.status)
      )
      checkOutOrders = todayOrders.filter(o => 
        o.status === 'checked_in'
      )
    } catch (error) {
      console.error('加载数据失败:', error)
      showNotification('加载数据失败', 'error')
    } finally {
      loading = false
    }
  }

  function showNotification(message, type) {
    notification = { message, type }
    setTimeout(() => {
      notification = null
    }, 3000)
  }

  async function handleCheckIn(order) {
    try {
      await orderApi.checkIn(order.id, { operator: 'system' })
      showNotification('入住成功', 'success')
      await loadData()
    } catch (error) {
      showNotification(error.response?.data?.error || '入住失败', 'error')
    }
  }

  async function handleCheckOut(order) {
    try {
      await orderApi.checkOut(order.id, { operator: 'system' })
      showNotification('退房成功', 'success')
      await loadData()
    } catch (error) {
      showNotification(error.response?.data?.error || '退房失败', 'error')
    }
  }

  async function handleChangeRoom() {
    if (!selectedOrder || !newRoomId) return
    
    try {
      await orderApi.changeRoom(selectedOrder.id, {
        newRoomId: parseInt(newRoomId),
        changeReason: changeReason || '换房',
        operator: 'system'
      })
      showNotification('换房成功', 'success')
      showChangeRoom = false
      newRoomId = null
      changeReason = ''
      await loadData()
    } catch (error) {
      showNotification(error.response?.data?.error || '换房失败', 'error')
    }
  }

  $: availableRooms = rooms.filter(r => r.status === 'available')

  function getStatusClass(status) {
    const classes = {
      pending: 'status-pending',
      paid: 'status-paid',
      checked_in: 'status-checked-in',
      checked_out: 'status-checked-out'
    }
    return classes[status] || 'status-pending'
  }

  function getStatusText(status) {
    const texts = {
      pending: '待支付',
      paid: '已支付',
      checked_in: '已入住',
      checked_out: '已退房'
    }
    return texts[status] || status
  }

  function openChangeRoom(order) {
    selectedOrder = order
    showChangeRoom = true
  }

  function openOrderDetail(order) {
    selectedOrder = order
    showOrderDetail = true
  }
</script>

<div class="checkin-page">
  {#if notification}
    <div class={`notification ${notification.type}`}>
      {notification.message}
    </div>
  {/if}

  <h2>🛏️ 入住管理</h2>

  {#if loading}
    <div class="loading">加载中...</div>
  {:else}
    <div class="dashboard-stats">
      <div class="stat-card">
        <div class="stat-value">{checkInOrders.length}</div>
        <div class="stat-label">今日待入住</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{checkOutOrders.length}</div>
        <div class="stat-label">当前在住</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{todayOrders.filter(o => o.status === 'checked_out').length}</div>
        <div class="stat-label">今日已退房</div>
      </div>
    </div>

    <div class="section-grid">
      <div class="section">
        <div class="section-header">
          <h3>📥 待入住订单</h3>
          <span class="badge count">{checkInOrders.length}</span>
        </div>
        
        {#if checkInOrders.length === 0}
          <div class="empty-section">暂无待入住订单</div>
        {:else}
          <div class="order-list">
            {#each checkInOrders as order}
              <div class="order-card">
                <div class="order-header">
                  <span class="room-number">{order.room_number}</span>
                  <span class={`status-badge ${getStatusClass(order.status)}`}>
                    {getStatusText(order.status)}
                  </span>
                </div>
                <div class="order-body">
                  <p class="guest-name">{order.guest_name}</p>
                  <p class="guest-phone">{order.guest_phone}</p>
                  <p class="room-type">{order.room_type}</p>
                  <p class="amount">¥{order.total_amount}</p>
                </div>
                <div class="order-actions">
                  <button class="btn-action" on:click={() => openOrderDetail(order)}>
                    详情
                  </button>
                  {#if order.status === 'paid'}
                    <button class="btn-primary" on:click={() => handleCheckIn(order)}>
                      入住
                    </button>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <div class="section">
        <div class="section-header">
          <h3>🏠 在住订单</h3>
          <span class="badge count">{checkOutOrders.length}</span>
        </div>
        
        {#if checkOutOrders.length === 0}
          <div class="empty-section">暂无在住订单</div>
        {:else}
          <div class="order-list">
            {#each checkOutOrders as order}
              <div class="order-card">
                <div class="order-header">
                  <span class="room-number">{order.room_number}</span>
                  <span class={`status-badge ${getStatusClass(order.status)}`}>
                    {getStatusText(order.status)}
                  </span>
                </div>
                <div class="order-body">
                  <p class="guest-name">{order.guest_name}</p>
                  <p class="guest-phone">{order.guest_phone}</p>
                  <p class="room-type">{order.room_type}</p>
                  <p class="checkout-date">退房: {order.check_out_date}</p>
                </div>
                <div class="order-actions">
                  <button class="btn-action" on:click={() => openOrderDetail(order)}>
                    详情
                  </button>
                  <button class="btn-action" on:click={() => openChangeRoom(order)}>
                    换房
                  </button>
                  <button class="btn-danger" on:click={() => handleCheckOut(order)}>
                    退房
                  </button>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  {/if}

  {#if showChangeRoom && selectedOrder}
    <div class="modal-overlay" on:click={() => showChangeRoom = false}>
      <div class="modal" on:click|stopPropagation>
        <div class="modal-header">
          <h3>换房</h3>
          <button class="close" on:click={() => showChangeRoom = false}>×</button>
        </div>
        <div class="modal-body">
          <div class="current-room">
            <h4>当前房间</h4>
            <p>{selectedOrder.room_number} - {selectedOrder.room_type}</p>
            <p>房价: ¥{selectedOrder.room_price}/晚</p>
          </div>

          <div class="form-group">
            <label>选择新房间</label>
            <select bind:value={newRoomId}>
              <option value="">请选择房间</option>
              {#each availableRooms as room}
                <option value={room.id}>
                  {room.room_number} - {room.type} (¥{room.price}/晚)
                </option>
              {/each}
            </select>
          </div>

          <div class="form-group">
            <label>换房原因</label>
            <textarea 
              bind:value={changeReason}
              placeholder="请输入换房原因"
              rows="3"
            ></textarea>
          </div>

          {#if newRoomId}
            {@const newRoom = rooms.find(r => r.id === parseInt(newRoomId))}
            {#if newRoom}
              <div class="price-diff">
                <p>新房型价格: ¥{newRoom.price}/晚</p>
                <p>价格差额: {newRoom.price > selectedOrder.room_price ? '+' : ''}
                    ¥{newRoom.price - selectedOrder.room_price}/晚</p>
              </div>
            {/if}
          {/if}

          <div class="action-buttons">
            <button class="btn" on:click={() => showChangeRoom = false}>取消</button>
            <button 
              class="btn btn-primary" 
              on:click={handleChangeRoom}
              disabled={!newRoomId}
            >
              确认换房
            </button>
          </div>
        </div>
      </div>
    </div>
  {/if}

  {#if showOrderDetail && selectedOrder}
    <div class="modal-overlay" on:click={() => showOrderDetail = false}>
      <div class="modal" on:click|stopPropagation>
        <div class="modal-header">
          <h3>订单详情</h3>
          <button class="close" on:click={() => showOrderDetail = false}>×</button>
        </div>
        <div class="modal-body">
          <div class="detail-grid">
            <div class="detail-item">
              <label>订单号</label>
              <p>{selectedOrder.order_number}</p>
            </div>
            <div class="detail-item">
              <label>房间</label>
              <p>{selectedOrder.room_number} - {selectedOrder.room_type}</p>
            </div>
            <div class="detail-item">
              <label>客人</label>
              <p>{selectedOrder.guest_name}</p>
            </div>
            <div class="detail-item">
              <label>电话</label>
              <p>{selectedOrder.guest_phone}</p>
            </div>
            <div class="detail-item">
              <label>入住日期</label>
              <p>{selectedOrder.check_in_date}</p>
            </div>
            <div class="detail-item">
              <label>退房日期</label>
              <p>{selectedOrder.check_out_date}</p>
            </div>
            <div class="detail-item">
              <label>总金额</label>
              <p class="amount">¥{selectedOrder.total_amount}</p>
            </div>
            <div class="detail-item">
              <label>状态</label>
              <p>
                <span class={`status-badge ${getStatusClass(selectedOrder.status)}`}>
                  {getStatusText(selectedOrder.status)}
                </span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .checkin-page {
    max-width: 1400px;
    margin: 0 auto;
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
  h2 {
    margin-bottom: 20px;
    color: #333;
  }
  .loading {
    text-align: center;
    padding: 60px;
    color: #999;
    font-size: 16px;
  }
  .dashboard-stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 20px;
    margin-bottom: 30px;
  }
  .stat-card {
    background: white;
    padding: 25px;
    border-radius: 10px;
    text-align: center;
    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
  }
  .stat-value {
    font-size: 36px;
    font-weight: bold;
    color: #1e3c72;
  }
  .stat-label {
    margin-top: 8px;
    color: #666;
    font-size: 14px;
  }
  .section-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 30px;
  }
  @media (max-width: 900px) {
    .section-grid {
      grid-template-columns: 1fr;
    }
  }
  .section {
    background: white;
    border-radius: 10px;
    padding: 20px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
  }
  .section-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 20px;
    padding-bottom: 10px;
    border-bottom: 2px solid #f0f0f0;
  }
  .section-header h3 {
    margin: 0;
    color: #1e3c72;
  }
  .badge.count {
    background: #1e3c72;
    color: white;
    padding: 4px 10px;
    border-radius: 12px;
    font-size: 12px;
  }
  .empty-section {
    text-align: center;
    padding: 40px;
    color: #999;
  }
  .order-list {
    display: flex;
    flex-direction: column;
    gap: 15px;
  }
  .order-card {
    background: #f8f9fa;
    border-radius: 8px;
    padding: 15px;
    border: 1px solid #e0e0e0;
  }
  .order-header {
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
  .status-badge {
    padding: 4px 10px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 500;
  }
  .status-pending { background: #fff3cd; color: #856404; }
  .status-paid { background: #cce5ff; color: #004085; }
  .status-checked-in { background: #d4edda; color: #155724; }
  .status-checked-out { background: #e2e3e5; color: #383d41; }
  .order-body {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 5px;
    margin-bottom: 10px;
  }
  .guest-name {
    font-weight: 500;
    color: #333;
    margin: 0;
  }
  .guest-phone {
    font-size: 13px;
    color: #666;
    margin: 0;
  }
  .room-type {
    font-size: 13px;
    color: #666;
    margin: 0;
  }
  .amount {
    font-weight: bold;
    color: #e74c3c;
    margin: 0;
  }
  .checkout-date {
    font-size: 13px;
    color: #666;
    margin: 0;
  }
  .order-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .btn-action {
    padding: 8px 16px;
    border: 1px solid #ddd;
    background: white;
    border-radius: 5px;
    cursor: pointer;
    font-size: 13px;
    transition: all 0.3s;
  }
  .btn-action:hover {
    background: #f8f9fa;
  }
  .btn-primary {
    padding: 8px 16px;
    border: none;
    background: #28a745;
    color: white;
    border-radius: 5px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
  }
  .btn-primary:hover {
    background: #218838;
  }
  .btn-danger {
    padding: 8px 16px;
    border: none;
    background: #dc3545;
    color: white;
    border-radius: 5px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
  }
  .btn-danger:hover {
    background: #c82333;
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
    color: #1e3c72;
  }
  .close {
    background: none;
    border: none;
    font-size: 28px;
    cursor: pointer;
    color: #999;
    padding: 0;
    line-height: 1;
  }
  .close:hover {
    color: #333;
  }
  .modal-body {
    padding: 20px;
  }
  .current-room {
    background: #f8f9fa;
    padding: 15px;
    border-radius: 8px;
    margin-bottom: 20px;
  }
  .current-room h4 {
    margin-bottom: 10px;
    color: #1e3c72;
  }
  .current-room p {
    margin: 5px 0;
    color: #666;
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
  .form-group select,
  .form-group textarea {
    width: 100%;
    padding: 10px;
    border: 1px solid #ddd;
    border-radius: 5px;
    font-size: 14px;
  }
  .price-diff {
    background: #fffbf0;
    padding: 15px;
    border-radius: 8px;
    margin-bottom: 20px;
  }
  .price-diff p {
    margin: 5px 0;
    color: #856404;
  }
  .action-buttons {
    display: flex;
    gap: 10px;
    margin-top: 20px;
  }
  .btn {
    flex: 1;
    padding: 12px;
    border: 1px solid #ddd;
    background: white;
    border-radius: 5px;
    cursor: pointer;
    font-size: 14px;
  }
  .btn:hover {
    background: #f8f9fa;
  }
  .btn.btn-primary {
    background: #28a745;
    color: white;
    border: none;
  }
  .btn.btn-primary:hover {
    background: #218838;
  }
  .btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .detail-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 15px;
  }
  .detail-item {
    padding: 10px;
    background: #f8f9fa;
    border-radius: 5px;
  }
  .detail-item label {
    display: block;
    font-size: 12px;
    color: #999;
    margin-bottom: 5px;
  }
  .detail-item p {
    margin: 0;
    font-weight: 500;
    color: #333;
  }
  .detail-item .amount {
    color: #e74c3c;
    font-weight: bold;
  }
</style>
