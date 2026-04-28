<script>
  import { onMount } from 'svelte'
  import dayjs from 'dayjs'
  import { reportApi, orderApi, paymentApi } from '../api.js'

  let loading = false
  let dashboardStats = null
  let revenueReport = []
  let paymentMethodStats = {}
  let selectedPeriod = 'month'
  let customStartDate = dayjs().subtract(30, 'day').format('YYYY-MM-DD')
  let customEndDate = dayjs().format('YYYY-MM-DD')
  let selectedYear = dayjs().year()
  let monthlySummary = []
  let notification = null

  $: {
    let start, end
    switch (selectedPeriod) {
      case 'today':
        start = dayjs().format('YYYY-MM-DD')
        end = dayjs().format('YYYY-MM-DD')
        break
      case 'week':
        start = dayjs().startOf('week').format('YYYY-MM-DD')
        end = dayjs().format('YYYY-MM-DD')
        break
      case 'month':
        start = dayjs().startOf('month').format('YYYY-MM-DD')
        end = dayjs().format('YYYY-MM-DD')
        break
      case 'custom':
        start = customStartDate
        end = customEndDate
        break
    }
    
    if (start && end) {
      loadReport(start, end)
    }
  }

  onMount(() => {
    loadDashboard()
    loadMonthlySummary(dayjs().year())
  })

  async function loadDashboard() {
    try {
      loading = true
      const response = await reportApi.getDashboard()
      dashboardStats = response.data.data
    } catch (error) {
      console.error('加载统计失败:', error)
    } finally {
      loading = false
    }
  }

  async function loadReport(startDate, endDate) {
    try {
      const [revenueResponse, paymentResponse] = await Promise.all([
        reportApi.getRevenue(startDate, endDate),
        reportApi.getPaymentMethodStats(startDate, endDate)
      ])
      
      revenueReport = revenueResponse.data.data || []
      paymentMethodStats = paymentResponse.data.data || {}
    } catch (error) {
      console.error('加载报表失败:', error)
    }
  }

  async function loadMonthlySummary(year) {
    try {
      const response = await reportApi.getMonthly(year)
      monthlySummary = response.data.data || []
    } catch (error) {
      console.error('加载月度统计失败:', error)
    }
  }

  function showNotification(message, type) {
    notification = { message, type }
    setTimeout(() => {
      notification = null
    }, 3000)
  }

  $: totalRevenue = revenueReport.reduce((sum, item) => sum + (item.netRevenue || 0), 0)
  $: totalOrders = revenueReport.reduce((sum, item) => sum + (item.totalOrders || 0), 0)

  $: {
    if (selectedYear) {
      loadMonthlySummary(selectedYear)
    }
  }

  const years = Array.from({ length: 5 }, (_, i) => dayjs().year() - i)
</script>

<div class="report-page">
  {#if notification}
    <div class={`notification ${notification.type}`}>
      {notification.message}
    </div>
  {/if}

  <h2>📊 营收报表</h2>

  {#if dashboardStats}
    <div class="dashboard-stats">
      <div class="stat-card primary">
        <div class="stat-icon">💰</div>
        <div class="stat-content">
          <div class="stat-value">¥{dashboardStats.today?.revenue?.toFixed(2) || '0.00'}</div>
          <div class="stat-label">今日营收</div>
        </div>
      </div>
      <div class="stat-card success">
        <div class="stat-icon">📦</div>
        <div class="stat-content">
          <div class="stat-value">{dashboardStats.today?.orders || 0}</div>
          <div class="stat-label">今日订单</div>
        </div>
      </div>
      <div class="stat-card warning">
        <div class="stat-icon">📥</div>
        <div class="stat-content">
          <div class="stat-value">{dashboardStats.todayCheckIns || 0}</div>
          <div class="stat-label">今日入住</div>
        </div>
      </div>
      <div class="stat-card info">
        <div class="stat-icon">📤</div>
        <div class="stat-content">
          <div class="stat-value">{dashboardStats.todayCheckOuts || 0}</div>
          <div class="stat-label">今日退房</div>
        </div>
      </div>
    </div>
  {/if}

  <div class="report-controls">
    <div class="period-selector">
      <label>时间周期:</label>
      <div class="period-buttons">
        <button 
          class={selectedPeriod === 'today' ? 'active' : ''}
          on:click={() => selectedPeriod = 'today'}
        >
          今日
        </button>
        <button 
          class={selectedPeriod === 'week' ? 'active' : ''}
          on:click={() => selectedPeriod = 'week'}
        >
          本周
        </button>
        <button 
          class={selectedPeriod === 'month' ? 'active' : ''}
          on:click={() => selectedPeriod = 'month'}
        >
          本月
        </button>
        <button 
          class={selectedPeriod === 'custom' ? 'active' : ''}
          on:click={() => selectedPeriod = 'custom'}
        >
          自定义
        </button>
      </div>
      
      {#if selectedPeriod === 'custom'}
        <div class="custom-dates">
          <input 
            type="date" 
            bind:value={customStartDate}
          />
          <span>至</span>
          <input 
            type="date" 
            bind:value={customEndDate}
          />
        </div>
      {/if}
    </div>
  </div>

  {#if totalRevenue > 0 || totalOrders > 0}
    <div class="summary-cards">
      <div class="summary-card">
        <div class="summary-label">总营收</div>
        <div class="summary-value revenue">¥{totalRevenue.toFixed(2)}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">订单数</div>
        <div class="summary-value orders">{totalOrders}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">平均订单金额</div>
        <div class="summary-value">¥{totalOrders > 0 ? (totalRevenue / totalOrders).toFixed(2) : '0.00'}</div>
      </div>
    </div>
  {/if}

  {#if Object.keys(paymentMethodStats).length > 0}
    <div class="payment-methods-section">
      <h3>支付方式统计</h3>
      <div class="payment-grid">
        {#each Object.entries(paymentMethodStats) as [method, stats]}
          <div class="payment-card">
            <div class="payment-method-name">
              {method === 'wechat' ? '微信支付' :
               method === 'alipay' ? '支付宝' :
               method === 'cash' ? '现金' :
               method === 'card' ? '银行卡' :
               method === 'transfer' ? '转账' : method}
            </div>
            <div class="payment-details">
              <p>笔数: {stats.count || 0}</p>
              <p class="amount">¥{(stats.total || 0).toFixed(2)}</p>
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  {#if revenueReport.length > 0}
    <div class="report-table-section">
      <h3>每日明细</h3>
      <div class="table-container">
        <table class="report-table">
          <thead>
            <tr>
              <th>日期</th>
              <th>订单数</th>
              <th>总营收</th>
              <th>已收款</th>
              <th>已退款</th>
              <th>净营收</th>
            </tr>
          </thead>
          <tbody>
            {#each revenueReport as item}
              <tr>
                <td>{item.date}</td>
                <td>{item.totalOrders}</td>
                <td>¥{item.totalRevenue?.toFixed(2) || '0.00'}</td>
                <td>¥{item.totalPaid?.toFixed(2) || '0.00'}</td>
                <td class="refund">¥{item.totalRefund?.toFixed(2) || '0.00'}</td>
                <td class="net">¥{item.netRevenue?.toFixed(2) || '0.00'}</td>
              </tr>
            {/each}
          </tbody>
          <tfoot>
            <tr>
              <td><strong>合计</strong></td>
              <td><strong>{totalOrders}</strong></td>
              <td><strong>¥{revenueReport.reduce((sum, i) => sum + (i.totalRevenue || 0), 0).toFixed(2)}</strong></td>
              <td><strong>¥{revenueReport.reduce((sum, i) => sum + (i.totalPaid || 0), 0).toFixed(2)}</strong></td>
              <td class="refund"><strong>¥{revenueReport.reduce((sum, i) => sum + (i.totalRefund || 0), 0).toFixed(2)}</strong></td>
              <td class="net"><strong>¥{totalRevenue.toFixed(2)}</strong></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  {/if}

  <div class="monthly-section">
    <div class="section-header">
      <h3>月度营收</h3>
      <select bind:value={selectedYear}>
        {#each years as year}
          <option value={year}>{year}年</option>
        {/each}
      </select>
    </div>
    
    {#if monthlySummary.length > 0}
      <div class="monthly-grid">
        {#each monthlySummary as month}
          <div class="monthly-card">
            <div class="month-name">{month.monthName}</div>
            <div class="monthly-stats">
              <p class="orders">{month.totalOrders} 单</p>
              <p class="revenue">¥{month.totalRevenue?.toFixed(2) || '0.00'}</p>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .report-page {
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
  h3 {
    margin-bottom: 15px;
    color: #1e3c72;
  }
  .dashboard-stats {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 20px;
    margin-bottom: 30px;
  }
  @media (max-width: 900px) {
    .dashboard-stats {
      grid-template-columns: repeat(2, 1fr);
    }
  }
  @media (max-width: 500px) {
    .dashboard-stats {
      grid-template-columns: 1fr;
    }
  }
  .stat-card {
    display: flex;
    align-items: center;
    gap: 15px;
    background: white;
    padding: 20px;
    border-radius: 10px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    border-left: 4px solid #6c757d;
  }
  .stat-card.primary { border-left-color: #1e3c72; }
  .stat-card.success { border-left-color: #28a745; }
  .stat-card.warning { border-left-color: #ffc107; }
  .stat-card.info { border-left-color: #17a2b8; }
  .stat-icon {
    font-size: 36px;
  }
  .stat-value {
    font-size: 24px;
    font-weight: bold;
    color: #1e3c72;
  }
  .stat-label {
    font-size: 13px;
    color: #999;
    margin-top: 4px;
  }
  .report-controls {
    background: white;
    padding: 20px;
    border-radius: 10px;
    margin-bottom: 20px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
  }
  .period-selector label {
    font-weight: 500;
    color: #555;
    margin-right: 10px;
  }
  .period-buttons {
    display: inline-flex;
    gap: 5px;
    margin-bottom: 15px;
  }
  .period-buttons button {
    padding: 8px 16px;
    border: 1px solid #ddd;
    background: white;
    border-radius: 5px;
    cursor: pointer;
    transition: all 0.3s;
  }
  .period-buttons button:hover {
    background: #f8f9fa;
  }
  .period-buttons button.active {
    background: #1e3c72;
    color: white;
    border-color: #1e3c72;
  }
  .custom-dates {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .custom-dates input {
    padding: 8px 12px;
    border: 1px solid #ddd;
    border-radius: 5px;
  }
  .summary-cards {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 20px;
    margin-bottom: 30px;
  }
  @media (max-width: 600px) {
    .summary-cards {
      grid-template-columns: 1fr;
    }
  }
  .summary-card {
    background: white;
    padding: 25px;
    border-radius: 10px;
    text-align: center;
    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
  }
  .summary-label {
    font-size: 14px;
    color: #999;
    margin-bottom: 10px;
  }
  .summary-value {
    font-size: 28px;
    font-weight: bold;
    color: #1e3c72;
  }
  .summary-value.revenue { color: #e74c3c; }
  .summary-value.orders { color: #28a745; }
  .payment-methods-section {
    background: white;
    padding: 20px;
    border-radius: 10px;
    margin-bottom: 30px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
  }
  .payment-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 15px;
  }
  .payment-card {
    background: #f8f9fa;
    padding: 15px;
    border-radius: 8px;
    text-align: center;
    border: 1px solid #e0e0e0;
  }
  .payment-method-name {
    font-weight: 500;
    color: #333;
    margin-bottom: 10px;
  }
  .payment-details p {
    margin: 5px 0;
    font-size: 13px;
    color: #666;
  }
  .payment-details .amount {
    font-weight: bold;
    color: #e74c3c;
    font-size: 16px;
  }
  .report-table-section {
    background: white;
    padding: 20px;
    border-radius: 10px;
    margin-bottom: 30px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
  }
  .table-container {
    overflow-x: auto;
  }
  .report-table {
    width: 100%;
    border-collapse: collapse;
  }
  .report-table th {
    background: #f8f9fa;
    padding: 12px 15px;
    text-align: left;
    font-weight: 600;
    color: #555;
    border-bottom: 2px solid #e0e0e0;
  }
  .report-table td {
    padding: 12px 15px;
    border-bottom: 1px solid #f0f0f0;
  }
  .report-table tfoot td {
    background: #f8f9fa;
    font-weight: bold;
    border-top: 2px solid #e0e0e0;
  }
  .refund { color: #dc3545; }
  .net { color: #28a745; font-weight: bold; }
  .monthly-section {
    background: white;
    padding: 20px;
    border-radius: 10px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
  }
  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
  }
  .section-header h3 {
    margin: 0;
  }
  .section-header select {
    padding: 8px 12px;
    border: 1px solid #ddd;
    border-radius: 5px;
  }
  .monthly-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 15px;
  }
  @media (max-width: 900px) {
    .monthly-grid {
      grid-template-columns: repeat(3, 1fr);
    }
  }
  @media (max-width: 600px) {
    .monthly-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }
  .monthly-card {
    background: #f8f9fa;
    padding: 15px;
    border-radius: 8px;
    text-align: center;
    border: 1px solid #e0e0e0;
    transition: all 0.3s;
  }
  .monthly-card:hover {
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  }
  .month-name {
    font-weight: 500;
    color: #1e3c72;
    margin-bottom: 10px;
  }
  .monthly-stats p {
    margin: 5px 0;
    font-size: 13px;
    color: #666;
  }
  .monthly-stats .revenue {
    font-weight: bold;
    color: #e74c3c;
    font-size: 15px;
  }
</style>
