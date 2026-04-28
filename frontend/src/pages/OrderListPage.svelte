<script>
  import { onMount } from 'svelte'
  import dayjs from 'dayjs'
  import { orderApi } from '../api.js'

  let loading = false
  let orders = []
  let filters = {
    status: '',
    guestName: '',
    startDate: '',
    endDate: ''
  }
  let selectedOrder = null
  let showOrderDetail = false
  let notification = null

  onMount(() => {
    loadOrders()
  })

  async function loadOrders() {
    try {
      loading = true
      const params = {}
      if (filters.status) params.status = filters.status
      if (filters.guestName) params.guestName = filters.guestName
      
      const response = await orderApi.list(params)
      orders = response.data.data || []
    } catch (error) {
      console.error('加载订单失败:', error)
      showNotification('加载订单失败', 'error')
    } finally {
      loading = false
    }
  }

  $: {
    if (filters) {
      // 这里可以添加过滤逻辑
    }
  }

  function getStatusClass(status) {
    const classes = {
      pending: 'status-pending',
      paid: 'status-paid',
      checked_in: 'status-checked-in',
      checked_out: 'status-checked-out',
      cancelled: 'status-cancelled',
      refunded: 'status-refunded'
    }
    return classes[status] || 'status-pending'
  }

  function getStatusText(status) {
    const texts = {
      pending: '待支付',
      paid: '已支付',
      checked_in: '已入住',
      checked_out: '已退房',
      cancelled: '已取消',
      refunded: '已退款'
    }
    return texts[status] || status
  }

  function selectOrder(order) {
    selectedOrder = order
    showOrderDetail = true
  }

  function showNotification(message, type) {
    notification = { message, type }
    setTimeout(() => {
      notification = null
    }, 3000)
  }

  async function handleCheckIn() {
    if (!selectedOrder) return
    try {
      await orderApi.checkIn(selectedOrder.id, { operator: 'system' })
      showNotification('入住成功', 'success')
      await loadOrders()
      showOrderDetail = false
    } catch (error) {
      showNotification(error.response?.data?.error || '入住失败', 'error')
    }
  }

  async function handleCheckOut() {
    if (!selectedOrder) return
    try {
      await orderApi.checkOut(selectedOrder.id, { operator: 'system' })
      showNotification('退房成功', 'success')
      await loadOrders()
      showOrderDetail = false
    } catch (error) {
      showNotification(error.response?.data?.error || '退房失败', 'error')
    }
  }

  async function handleCancel() {
    if (!selectedOrder) return
    if (!confirm('确定要取消这个订单吗？')) return
    
    try {
      await orderApi.cancel(selectedOrder.id, { cancelReason: '用户取消', operator: 'system' })
      showNotification('订单已取消', 'success')
      await loadOrders()
      showOrderDetail = false
    } catch (error) {
      showNotification(error.response?.data?.error || '取消失败', 'error')
    }
  }

  function formatDate(dateStr) {
    if (!dateStr) return '-'
    return dayjs(dateStr).format('YYYY-MM-DD')
  }
</script>

<div class="order-list-page">
  {#if notification}
    <div class={`notification ${notification.type}`}>
      {notification.message}
    </div>
  {/if}

  <h2>📋 订单列表</h2>

  <div class="filter-bar">
    <div class="filter-item">
      <label>订单状态</label>
      <select bind:value={filters.status} on:change={loadOrders}>
        <option value="">全部状态</option>
        <option value="pending">待支付</option>
        <option value="paid">已支付</option>
        <option value="checked_in">已入住</option>
        <option value="checked_out">已退房</option>
        <option value="cancelled">已取消</option>
        <option value="refunded">已退款</option>
      </select>
    </div>
    <div class="filter-item">
      <label>客人姓名</label>
      <input 
        type="text" 
        bind:value={filters.guestName}
        placeholder="搜索客人姓名"
        on:input={loadOrders}
      />
    </div>
    <button class="btn-refresh" on:click={loadOrders}>
      🔄 刷新
    </button>
  </div>

  {#if loading}
    <div class="loading">加载中...</div>
  {:else if orders.length === 0}
    <div class="empty">暂无订单数据</div>
  {:else}
    <div class="order-table-container">
      <table class="order-table">
        <thead>
          <tr>
            <th>订单号</th>
            <th>房间</th>
            <th>客人</th>
            <th>入住日期</th>
            <th>退房日期</th>
            <th>金额</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {#each orders as order}
            <tr on:click={() => selectOrder(order)}>
              <td class="order-number">{order.order_number}</td>
              <td>
                <div class="room-info">
                  <span class="room-num">{order.room_number}</span>
                  <span class="room-type">{order.room_type}</span>
                </div>
              </td>
              <td>
                <div class="guest-info">
                  <span class="guest-name">{order.guest_name}</span>
                  <span class="guest-phone">{order.guest_phone}</span>
                </div>
              </td>
              <td>{formatDate(order.check_in_date)}</td>
              <td>{formatDate(order.check_out_date)}</td>
              <td class="amount">¥{order.total_amount}</td>
              <td>
                <span class={`status-badge ${getStatusClass(order.status)}`}>
                  {getStatusText(order.status)}
                </span>
              </td>
              <td class="actions">
                {#if order.status === 'paid'}
                  <button class="btn-action" on:click|stopPropagation={handleCheckIn}>
                    入住
                  </button>
                {:else if order.status === 'checked_in'}
                  <button class="btn-action btn-primary" on:click|stopPropagation={handleCheckOut}>
                    退房
                  </button>
                {:else if order.status === 'pending'}
                  <button class="btn-action btn-danger" on:click|stopPropagation={handleCancel}>
                    取消
                  </button>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
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
          <div class="detail-section">
            <h4>基本信息</h4>
            <div class="detail-grid">
              <div class="detail-item">
                <label>订单号</label>
                <p>{selectedOrder.order_number}</p>
              </div>
              <div class="detail-item">
                <label>状态</label>
                <p>
                  <span class={`status-badge ${getStatusClass(selectedOrder.status)}`}>
                    {getStatusText(selectedOrder.status)}
                  </span>
                </p>
              </div>
              <div class="detail-item">
                <label>房间</label>
                <p>{selectedOrder.room_number} - {selectedOrder.room_type}</p>
              </div>
              <div class="detail-item">
                <label>房价</label>
                <p>¥{selectedOrder.room_price}/晚</p>
              </div>
            </div>
          </div>

          <div class="detail-section">
            <h4>客人信息</h4>
            <div class="detail-grid">
              <div class="detail-item">
                <label>姓名</label>
                <p>{selectedOrder.guest_name}</p>
              </div>
              <div class="detail-item">
                <label>电话</label>
                <p>{selectedOrder.guest_phone}</p>
              </div>
              <div class="detail-item">
                <label>身份证号</label>
                <p>{selectedOrder.guest_id_card || '-'}</p>
              </div>
              <div class="detail-item">
                <label>入住人数</label>
                <p>{selectedOrder.guest_count} 人</p>
              </div>
            </div>
          </div>

          <div class="detail-section">
            <h4>日期信息</h4>
            <div class="detail-grid">
              <div class="detail-item">
                <label>入住日期</label>
                <p>{formatDate(selectedOrder.check_in_date)}</p>
              </div>
              <div class="detail-item">
                <label>退房日期</label>
                <p>{formatDate(selectedOrder.check_out_date)}</p>
              </div>
              <div class="detail-item">
                <label>实际入住</label>
                <p>{selectedOrder.actual_check_in_time ? dayjs(selectedOrder.actual_check_in_time).format('YYYY-MM-DD HH:mm') : '-'}</p>
              </div>
              <div class="detail-item">
                <label>实际退房</label>
                <p>{selectedOrder.actual_check_out_time ? dayjs(selectedOrder.actual_check_out_time).format('YYYY-MM-DD HH:mm') : '-'}</p>
              </div>
            </div>
          </div>

          <div class="detail-section">
            <h4>费用信息</h4>
            <div class="price-summary">
              <div class="price-row">
                <span>房费</span>
                <span>¥{selectedOrder.total_amount}</span>
              </div>
              <div class="price-row">
                <span>已支付</span>
                <span class="paid">¥{selectedOrder.paid_amount || 0}</span>
              </div>
              <div class="price-row">
                <span>已退款</span>
                <span class="refund">¥{selectedOrder.refund_amount || 0}</span>
              </div>
              <div class="price-row total">
                <span>待支付</span>
                <span class="balance">¥{(selectedOrder.total_amount || 0) - (selectedOrder.paid_amount || 0) + (selectedOrder.refund_amount || 0)}</span>
              </div>
            </div>
          </div>

          {#if selectedOrder.special_requests}
            <div class="detail-section">
              <h4>特殊要求</h4>
              <p class="special-requests">{selectedOrder.special_requests}</p>
            </div>
          {/if}

          <div class="action-buttons">
            {#if selectedOrder.status === 'paid'}
              <button class="btn btn-primary" on:click={handleCheckIn}>
                办理入住
              </button>
            {:else if selectedOrder.status === 'checked_in'}
              <button class="btn btn-primary" on:click={handleCheckOut}>
                办理退房
              </button>
            {:else if selectedOrder.status === 'pending'}
              <button class="btn btn-danger" on:click={handleCancel}>
                取消订单
              </button>
            {/if}
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .order-list-page {
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
  .filter-bar {
    display: flex;
    gap: 15px;
    margin-bottom: 20px;
    flex-wrap: wrap;
    align-items: flex-end;
  }
  .filter-item {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .filter-item label {
    font-size: 13px;
    color: #666;
    font-weight: 500;
  }
  .filter-item select,
  .filter-item input {
    padding: 10px 15px;
    border: 1px solid #ddd;
    border-radius: 5px;
    min-width: 150px;
  }
  .btn-refresh {
    padding: 10px 20px;
    background: #2a5298;
    color: white;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    transition: background 0.3s;
  }
  .btn-refresh:hover {
    background: #1e3c72;
  }
  .loading, .empty {
    text-align: center;
    padding: 60px;
    color: #999;
    font-size: 16px;
  }
  .order-table-container {
    background: white;
    border-radius: 10px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    overflow-x: auto;
  }
  .order-table {
    width: 100%;
    border-collapse: collapse;
  }
  .order-table thead {
    background: #f8f9fa;
  }
  .order-table th {
    padding: 15px;
    text-align: left;
    font-weight: 600;
    color: #555;
    border-bottom: 2px solid #e0e0e0;
  }
  .order-table td {
    padding: 15px;
    border-bottom: 1px solid #f0f0f0;
    cursor: pointer;
  }
  .order-table tr:hover td {
    background: #f8f9fa;
  }
  .order-number {
    font-family: monospace;
    font-size: 13px;
    color: #1e3c72;
    font-weight: 500;
  }
  .room-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .room-num {
    font-weight: 500;
    color: #333;
  }
  .room-type {
    font-size: 12px;
    color: #999;
  }
  .guest-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .guest-name {
    font-weight: 500;
    color: #333;
  }
  .guest-phone {
    font-size: 12px;
    color: #999;
  }
  .amount {
    font-weight: 600;
    color: #e74c3c;
  }
  .status-badge {
    padding: 5px 12px;
    border-radius: 15px;
    font-size: 12px;
    font-weight: 500;
  }
  .status-pending { background: #fff3cd; color: #856404; }
  .status-paid { background: #cce5ff; color: #004085; }
  .status-checked-in { background: #d4edda; color: #155724; }
  .status-checked-out { background: #e2e3e5; color: #383d41; }
  .status-cancelled { background: #f8d7da; color: #721c24; }
  .status-refunded { background: #f8d7da; color: #721c24; }
  .actions {
    white-space: nowrap;
  }
  .btn-action {
    padding: 6px 12px;
    border: 1px solid #ddd;
    background: white;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
    margin: 0 2px;
    transition: all 0.3s;
  }
  .btn-action:hover {
    background: #f8f9fa;
  }
  .btn-action.btn-primary {
    background: #28a745;
    color: white;
    border-color: #28a745;
  }
  .btn-action.btn-danger {
    background: #dc3545;
    color: white;
    border-color: #dc3545;
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
    max-width: 600px;
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
  .detail-section {
    margin-bottom: 20px;
  }
  .detail-section h4 {
    margin-bottom: 12px;
    color: #1e3c72;
    font-size: 14px;
    padding-bottom: 8px;
    border-bottom: 1px solid #eee;
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
  .price-summary {
    background: #f8f9fa;
    border-radius: 8px;
    padding: 15px;
  }
  .price-row {
    display: flex;
    justify-content: space-between;
    padding: 8px 0;
    border-bottom: 1px solid #e0e0e0;
  }
  .price-row:last-child {
    border-bottom: none;
  }
  .price-row.total {
    font-weight: bold;
    font-size: 16px;
    padding-top: 10px;
  }
  .paid { color: #28a745; }
  .refund { color: #dc3545; }
  .balance { color: #e74c3c; }
  .special-requests {
    background: #fffbf0;
    padding: 12px;
    border-radius: 5px;
    color: #856404;
    line-height: 1.6;
  }
  .action-buttons {
    display: flex;
    gap: 10px;
    margin-top: 20px;
  }
  .btn {
    flex: 1;
    padding: 12px;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    transition: all 0.3s;
  }
  .btn-primary {
    background: #28a745;
    color: white;
  }
  .btn-primary:hover {
    background: #218838;
  }
  .btn-danger {
    background: #dc3545;
    color: white;
  }
  .btn-danger:hover {
    background: #c82333;
  }
</style>
