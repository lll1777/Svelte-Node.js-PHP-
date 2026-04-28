<script>
  import { onMount } from 'svelte'
  import dayjs from 'dayjs'
  import { cleaningApi, roomApi } from '../api.js'

  let loading = false
  let cleaningTasks = []
  let rooms = []
  let selectedDate = dayjs().format('YYYY-MM-DD')
  let notification = null

  onMount(() => {
    loadData()
  })

  $: {
    if (selectedDate) {
      loadData()
    }
  }

  async function loadData() {
    try {
      loading = true
      
      const [tasksResponse, roomsResponse] = await Promise.all([
        cleaningApi.list({ scheduleDate: selectedDate }),
        roomApi.list({})
      ])
      
      cleaningTasks = tasksResponse.data.data || []
      rooms = roomsResponse.data.data || []
      
      const dirtyRooms = rooms.filter(r => r.status === 'cleaning')
      for (let room of dirtyRooms) {
        const existingTask = cleaningTasks.find(t => t.room_id === room.id)
        if (!existingTask) {
          cleaningTasks.push({
            id: `temp-${room.id}`,
            room_id: room.id,
            room_number: room.room_number,
            room_type: room.type,
            schedule_date: selectedDate,
            priority: 'urgent',
            status: 'pending'
          })
        }
      }
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

  async function startCleaning(task) {
    try {
      await cleaningApi.updateStatus(task.id, 'in_progress')
      showNotification('开始清洁', 'success')
      await loadData()
    } catch (error) {
      showNotification('操作失败', 'error')
    }
  }

  async function completeCleaning(task) {
    try {
      await cleaningApi.updateStatus(task.id, 'completed')
      
      const room = rooms.find(r => r.id === task.room_id)
      if (room) {
        await roomApi.updateStatus(room.id, 'available')
      }
      
      showNotification('清洁完成，房间已可用', 'success')
      await loadData()
    } catch (error) {
      showNotification('操作失败', 'error')
    }
  }

  async function createCleaningTask(roomId) {
    try {
      await cleaningApi.create({
        roomId,
        scheduleDate: selectedDate,
        priority: 'normal'
      })
      showNotification('清洁任务已创建', 'success')
      await loadData()
    } catch (error) {
      showNotification('创建失败', 'error')
    }
  }

  $: pendingTasks = cleaningTasks.filter(t => t.status === 'pending')
  $: inProgressTasks = cleaningTasks.filter(t => t.status === 'in_progress')
  $: completedTasks = cleaningTasks.filter(t => t.status === 'completed')

  $: availableRooms = rooms.filter(r => r.status === 'cleaning')

  function getPriorityClass(priority) {
    const classes = {
      urgent: 'priority-urgent',
      normal: 'priority-normal',
      low: 'priority-low'
    }
    return classes[priority] || 'priority-normal'
  }

  function getPriorityText(priority) {
    const texts = {
      urgent: '紧急',
      normal: '普通',
      low: '低'
    }
    return texts[priority] || priority
  }

  function getStatusClass(status) {
    const classes = {
      pending: 'status-pending',
      in_progress: 'status-in-progress',
      completed: 'status-completed'
    }
    return classes[status] || 'status-pending'
  }

  function getStatusText(status) {
    const texts = {
      pending: '待清洁',
      in_progress: '清洁中',
      completed: '已完成'
    }
    return texts[status] || status
  }
</script>

<div class="cleaning-page">
  {#if notification}
    <div class={`notification ${notification.type}`}>
      {notification.message}
    </div>
  {/if}

  <div class="page-header">
    <h2>🧹 清洁管理</h2>
    <div class="date-selector">
      <label>日期:</label>
      <input 
        type="date" 
        bind:value={selectedDate}
        max={dayjs().add(30, 'day').format('YYYY-MM-DD')}
      />
    </div>
  </div>

  <div class="dashboard-stats">
    <div class="stat-card pending">
      <div class="stat-value">{pendingTasks.length}</div>
      <div class="stat-label">待清洁</div>
    </div>
    <div class="stat-card in-progress">
      <div class="stat-value">{inProgressTasks.length}</div>
      <div class="stat-label">清洁中</div>
    </div>
    <div class="stat-card completed">
      <div class="stat-value">{completedTasks.length}</div>
      <div class="stat-label">已完成</div>
    </div>
  </div>

  {#if loading}
    <div class="loading">加载中...</div>
  {:else}
    <div class="sections">
      {#if pendingTasks.length > 0}
        <div class="section">
          <div class="section-header">
            <h3>📋 待清洁</h3>
            <span class="badge count">{pendingTasks.length}</span>
          </div>
          <div class="task-list">
            {#each pendingTasks as task}
              <div class={`task-card ${getPriorityClass(task.priority)}`}>
                <div class="task-header">
                  <span class="room-number">{task.room_number || '未知房间'}</span>
                  <span class={`priority-badge ${getPriorityClass(task.priority)}`}>
                    {getPriorityText(task.priority)}
                  </span>
                </div>
                <div class="task-body">
                  <p class="room-type">{task.room_type || '-'}</p>
                  <p class="task-status">
                    状态: <span class={`status-tag ${getStatusClass(task.status)}`}>
                      {getStatusText(task.status)}
                    </span>
                  </p>
                </div>
                <div class="task-actions">
                  <button class="btn-primary" on:click={() => startCleaning(task)}>
                    开始清洁
                  </button>
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      {#if inProgressTasks.length > 0}
        <div class="section">
          <div class="section-header">
            <h3>🔄 清洁中</h3>
            <span class="badge count">{inProgressTasks.length}</span>
          </div>
          <div class="task-list">
            {#each inProgressTasks as task}
              <div class="task-card status-in-progress">
                <div class="task-header">
                  <span class="room-number">{task.room_number || '未知房间'}</span>
                  <span class={`priority-badge ${getPriorityClass(task.priority)}`}>
                    {getPriorityText(task.priority)}
                  </span>
                </div>
                <div class="task-body">
                  <p class="room-type">{task.room_type || '-'}</p>
                  <p class="task-status">
                    状态: <span class="status-tag status-in-progress">
                      {getStatusText(task.status)}
                    </span>
                  </p>
                </div>
                <div class="task-actions">
                  <button class="btn-success" on:click={() => completeCleaning(task)}>
                    完成清洁
                  </button>
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      {#if completedTasks.length > 0}
        <div class="section">
          <div class="section-header">
            <h3>✅ 已完成</h3>
            <span class="badge count">{completedTasks.length}</span>
          </div>
          <div class="task-list">
            {#each completedTasks as task}
              <div class="task-card status-completed">
                <div class="task-header">
                  <span class="room-number">{task.room_number || '未知房间'}</span>
                  <span class="status-tag status-completed">已完成</span>
                </div>
                <div class="task-body">
                  <p class="room-type">{task.room_type || '-'}</p>
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      {#if cleaningTasks.length === 0}
        <div class="empty">
          <p>今日暂无清洁任务</p>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .cleaning-page {
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
    margin: 0;
    color: #333;
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
    border-left: 4px solid #6c757d;
  }
  .stat-card.pending { border-left-color: #ffc107; }
  .stat-card.in-progress { border-left-color: #007bff; }
  .stat-card.completed { border-left-color: #28a745; }
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
  .loading, .empty {
    text-align: center;
    padding: 60px;
    color: #999;
    font-size: 16px;
  }
  .sections {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
    gap: 30px;
  }
  @media (max-width: 800px) {
    .sections {
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
  .task-list {
    display: flex;
    flex-direction: column;
    gap: 15px;
  }
  .task-card {
    background: #f8f9fa;
    border-radius: 8px;
    padding: 15px;
    border: 1px solid #e0e0e0;
    border-left: 4px solid #6c757d;
  }
  .task-card.priority-urgent { border-left-color: #dc3545; }
  .task-card.priority-normal { border-left-color: #ffc107; }
  .task-card.priority-low { border-left-color: #6c757d; }
  .task-card.status-in-progress { border-left-color: #007bff; background: #f0f8ff; }
  .task-card.status-completed { border-left-color: #28a745; background: #f8fff9; opacity: 0.7; }
  .task-header {
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
  .priority-badge {
    padding: 4px 10px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 500;
  }
  .priority-badge.priority-urgent { background: #dc3545; color: white; }
  .priority-badge.priority-normal { background: #ffc107; color: #856404; }
  .priority-badge.priority-low { background: #6c757d; color: white; }
  .task-body {
    margin-bottom: 10px;
  }
  .room-type {
    font-size: 13px;
    color: #666;
    margin: 5px 0;
  }
  .task-status {
    font-size: 13px;
    color: #666;
    margin: 5px 0;
  }
  .status-tag {
    padding: 2px 8px;
    border-radius: 10px;
    font-size: 12px;
    font-weight: 500;
  }
  .status-tag.status-pending { background: #fff3cd; color: #856404; }
  .status-tag.status-in-progress { background: #cce5ff; color: #004085; }
  .status-tag.status-completed { background: #d4edda; color: #155724; }
  .task-actions {
    display: flex;
    gap: 10px;
  }
  .btn-primary, .btn-success {
    flex: 1;
    padding: 10px;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    transition: all 0.3s;
  }
  .btn-primary {
    background: #007bff;
    color: white;
  }
  .btn-primary:hover {
    background: #0056b3;
  }
  .btn-success {
    background: #28a745;
    color: white;
  }
  .btn-success:hover {
    background: #218838;
  }
</style>
