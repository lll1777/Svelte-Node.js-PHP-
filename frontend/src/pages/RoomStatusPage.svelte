<script>
  import { onMount } from 'svelte'
  import dayjs from 'dayjs'
  import { roomApi, orderApi } from '../api.js'

  let loading = false
  let rooms = []
  let selectedDate = dayjs().format('YYYY-MM-DD')
  let selectedRoom = null
  let showRoomDetail = false
  let notification = null

  $: {
    if (selectedDate) {
      loadRooms()
    }
  }

  async function loadRooms() {
    try {
      loading = true
      const response = await roomApi.list()
      rooms = response.data.data || []
      
      for (let room of rooms) {
        room.availability = await checkRoomAvailability(room.id)
      }
    } catch (error) {
      console.error('加载房间失败:', error)
      showNotification('加载房间失败', 'error')
    } finally {
      loading = false
    }
  }

  async function checkRoomAvailability(roomId) {
    try {
      const response = await roomApi.getAvailability({
        checkInDate: selectedDate,
        checkOutDate: dayjs(selectedDate).add(1, 'day').format('YYYY-MM-DD'),
        roomId
      })
      return response.data.data || []
    } catch (error) {
      return []
    }
  }

  $: roomsByFloor = {}
  $: {
    roomsByFloor = {}
    rooms.forEach(room => {
      if (!roomsByFloor[room.floor]) {
        roomsByFloor[room.floor] = []
      }
      roomsByFloor[room.floor].push(room)
    })
  }

  $: sortedFloors = Object.keys(roomsByFloor).sort((a, b) => parseInt(a) - parseInt(b))

  function getRoomStatusClass(room) {
    const isAvailable = room.availability && room.availability.length > 0
    
    if (room.status === 'maintenance') {
      return 'maintenance'
    }
    if (room.status === 'cleaning') {
      return 'cleaning'
    }
    if (room.status === 'occupied') {
      return 'occupied'
    }
    if (!isAvailable) {
      return 'reserved'
    }
    return 'available'
  }

  function getRoomStatusText(room) {
    const isAvailable = room.availability && room.availability.length > 0
    
    if (room.status === 'maintenance') return '维护中'
    if (room.status === 'cleaning') return '清洁中'
    if (room.status === 'occupied') return '已入住'
    if (!isAvailable) return '已预订'
    return '可用'
  }

  function getRoomStatusIcon(room) {
    const isAvailable = room.availability && room.availability.length > 0
    
    if (room.status === 'maintenance') return '🔧'
    if (room.status === 'cleaning') return '🧹'
    if (room.status === 'occupied') return '🛏️'
    if (!isAvailable) return '📅'
    return '✅'
  }

  function selectRoom(room) {
    selectedRoom = room
    showRoomDetail = true
  }

  function showNotification(message, type) {
    notification = { message, type }
    setTimeout(() => {
      notification = null
    }, 3000)
  }

  async function changeRoomStatus(roomId, newStatus) {
    try {
      await roomApi.updateStatus(roomId, newStatus)
      showNotification('状态更新成功', 'success')
      await loadRooms()
    } catch (error) {
      console.error('更新状态失败:', error)
      showNotification('更新状态失败', 'error')
    }
  }

  async function lockRoom(roomId) {
    try {
      await roomApi.lock(roomId, { lockType: 'maintenance', lockReason: '手动锁定' })
      await changeRoomStatus(roomId, 'maintenance')
    } catch (error) {
      showNotification('锁定房间失败', 'error')
    }
  }

  async function unlockRoom(roomId) {
    try {
      await roomApi.unlock(roomId)
      await changeRoomStatus(roomId, 'available')
    } catch (error) {
      showNotification('解锁房间失败', 'error')
    }
  }
</script>

<div class="room-status-page">
  {#if notification}
    <div class={`notification ${notification.type}`}>
      {notification.message}
    </div>
  {/if}

  <div class="page-header">
    <h2>🏨 房态图</h2>
    <div class="date-selector">
      <label>查看日期:</label>
      <input 
        type="date" 
        bind:value={selectedDate}
        max={dayjs().add(90, 'day').format('YYYY-MM-DD')}
      />
      <button on:click={() => selectedDate = dayjs().format('YYYY-MM-DD')}>
        今天
      </button>
    </div>
  </div>

  <div class="status-legend">
    <div class="legend-item">
      <span class="status-badge available">✅ 可用</span>
    </div>
    <div class="legend-item">
      <span class="status-badge reserved">📅 已预订</span>
    </div>
    <div class="legend-item">
      <span class="status-badge occupied">🛏️ 已入住</span>
    </div>
    <div class="legend-item">
      <span class="status-badge cleaning">🧹 清洁中</span>
    </div>
    <div class="legend-item">
      <span class="status-badge maintenance">🔧 维护中</span>
    </div>
  </div>

  {#if loading}
    <div class="loading">加载中...</div>
  {:else if rooms.length === 0}
    <div class="empty">暂无房间数据</div>
  {:else}
    <div class="floor-list">
      {#each sortedFloors as floor}
        <div class="floor-section">
          <div class="floor-header">
            <h3>{floor} 层</h3>
            <span class="floor-count">
              {roomsByFloor[floor].length} 间房
            </span>
          </div>
          <div class="room-grid">
            {#each roomsByFloor[floor] as room}
              <div 
                class={`room-card ${getRoomStatusClass(room)}`}
                on:click={() => selectRoom(room)}
              >
                <div class="room-header">
                  <span class="room-number">{room.room_number}</span>
                  <span class="room-icon">{getRoomStatusIcon(room)}</span>
                </div>
                <div class="room-body">
                  <p class="room-type">{room.type}</p>
                  <p class="room-price">¥{room.price}/晚</p>
                  <p class="room-status">{getRoomStatusText(room)}</p>
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  {/if}

  {#if showRoomDetail && selectedRoom}
    <div class="modal-overlay" on:click={() => showRoomDetail = false}>
      <div class="modal" on:click|stopPropagation>
        <div class="modal-header">
          <h3>房间详情</h3>
          <button class="close" on:click={() => showRoomDetail = false}>×</button>
        </div>
        <div class="modal-body">
          <div class="room-detail-header">
            <div class="room-number-large">{selectedRoom.room_number}</div>
            <div class={`status-large ${getRoomStatusClass(selectedRoom)}`}>
              {getRoomStatusIcon(selectedRoom)} {getRoomStatusText(selectedRoom)}
            </div>
          </div>
          
          <div class="room-info-grid">
            <div class="info-item">
              <label>房间类型</label>
              <p>{selectedRoom.type}</p>
            </div>
            <div class="info-item">
              <label>楼层</label>
              <p>{selectedRoom.floor} 层</p>
            </div>
            <div class="info-item">
              <label>房价</label>
              <p>¥{selectedRoom.price}/晚</p>
            </div>
            <div class="info-item">
              <label>最大入住</label>
              <p>{selectedRoom.max_guests} 人</p>
            </div>
          </div>

          {#if selectedRoom.description}
            <div class="info-section">
              <h4>房间描述</h4>
              <p>{selectedRoom.description}</p>
            </div>
          {/if}

          <div class="action-buttons">
            {#if selectedRoom.status === 'available'}
              <button class="btn" on:click={() => lockRoom(selectedRoom.id)}>
                🔧 设为维护
              </button>
            {:else if selectedRoom.status === 'maintenance'}
              <button class="btn btn-success" on:click={() => unlockRoom(selectedRoom.id)}>
                ✅ 解除维护
              </button>
            {:else if selectedRoom.status === 'cleaning'}
              <button class="btn btn-success" on:click={() => changeRoomStatus(selectedRoom.id, 'available')}>
                ✅ 完成清洁
              </button>
            {/if}
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .room-status-page {
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
  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
    flex-wrap: wrap;
    gap: 15px;
  }
  h2 {
    color: #333;
    margin: 0;
  }
  .date-selector {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .date-selector label {
    font-weight: 500;
    color: #555;
  }
  .date-selector input {
    padding: 8px 12px;
    border: 1px solid #ddd;
    border-radius: 5px;
  }
  .date-selector button {
    padding: 8px 16px;
    background: #2a5298;
    color: white;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    transition: background 0.3s;
  }
  .date-selector button:hover {
    background: #1e3c72;
  }
  .status-legend {
    display: flex;
    gap: 15px;
    margin-bottom: 20px;
    flex-wrap: wrap;
  }
  .legend-item {
    display: flex;
    align-items: center;
  }
  .status-badge {
    padding: 6px 12px;
    border-radius: 5px;
    font-size: 13px;
    font-weight: 500;
  }
  .status-badge.available { background: #d4edda; color: #155724; }
  .status-badge.reserved { background: #fff3cd; color: #856404; }
  .status-badge.occupied { background: #f8d7da; color: #721c24; }
  .status-badge.cleaning { background: #e2e3e5; color: #383d41; }
  .status-badge.maintenance { background: #f8d7da; color: #721c24; }
  .loading, .empty {
    text-align: center;
    padding: 60px;
    color: #999;
    font-size: 16px;
  }
  .floor-list {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  .floor-section {
    background: white;
    border-radius: 10px;
    padding: 20px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
  }
  .floor-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 15px;
    padding-bottom: 10px;
    border-bottom: 2px solid #f0f0f0;
  }
  .floor-header h3 {
    margin: 0;
    color: #1e3c72;
  }
  .floor-count {
    color: #999;
    font-size: 14px;
  }
  .room-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 12px;
  }
  .room-card {
    border: 2px solid #e0e0e0;
    border-radius: 8px;
    padding: 12px;
    cursor: pointer;
    transition: all 0.3s ease;
  }
  .room-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  }
  .room-card.available { background: #f8fff9; border-color: #a5d6a7; }
  .room-card.reserved { background: #fffdf5; border-color: #ffe082; }
  .room-card.occupied { background: #fff5f5; border-color: #ef9a9a; }
  .room-card.cleaning { background: #fafafa; border-color: #bdbdbd; }
  .room-card.maintenance { background: #fff5f5; border-color: #ef9a9a; }
  .room-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }
  .room-number {
    font-size: 16px;
    font-weight: bold;
    color: #1e3c72;
  }
  .room-icon {
    font-size: 18px;
  }
  .room-body {
    text-align: center;
  }
  .room-type {
    font-size: 12px;
    color: #666;
    margin: 3px 0;
  }
  .room-price {
    font-size: 14px;
    font-weight: bold;
    color: #e74c3c;
    margin: 3px 0;
  }
  .room-status {
    font-size: 11px;
    color: #999;
    margin-top: 5px;
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
  .room-detail-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
  }
  .room-number-large {
    font-size: 32px;
    font-weight: bold;
    color: #1e3c72;
  }
  .status-large {
    padding: 8px 16px;
    border-radius: 20px;
    font-weight: 500;
    font-size: 14px;
  }
  .status-large.available { background: #d4edda; color: #155724; }
  .status-large.reserved { background: #fff3cd; color: #856404; }
  .status-large.occupied { background: #f8d7da; color: #721c24; }
  .status-large.cleaning { background: #e2e3e5; color: #383d41; }
  .status-large.maintenance { background: #f8d7da; color: #721c24; }
  .room-info-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 15px;
    margin-bottom: 20px;
  }
  .info-item {
    padding: 12px;
    background: #f8f9fa;
    border-radius: 8px;
  }
  .info-item label {
    display: block;
    font-size: 12px;
    color: #999;
    margin-bottom: 5px;
  }
  .info-item p {
    margin: 0;
    font-size: 16px;
    font-weight: 500;
    color: #333;
  }
  .info-section {
    margin-bottom: 20px;
  }
  .info-section h4 {
    margin-bottom: 10px;
    color: #333;
  }
  .info-section p {
    color: #666;
    line-height: 1.6;
  }
  .action-buttons {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }
  .btn {
    flex: 1;
    min-width: 120px;
    padding: 12px;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    transition: all 0.3s;
    background: #6c757d;
    color: white;
  }
  .btn:hover {
    opacity: 0.9;
  }
  .btn-success {
    background: #28a745;
  }
</style>
