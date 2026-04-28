<script>
  import { onMount } from 'svelte'
  import dayjs from 'dayjs'
  import { invoiceApi, orderApi } from '../api.js'

  let loading = false
  let invoices = []
  let orders = []
  let showCreateModal = false
  let selectedInvoice = null
  let notification = null

  let newInvoice = {
    orderId: null,
    invoiceType: 'personal',
    title: '',
    taxNumber: '',
    address: '',
    phone: '',
    bankName: '',
    bankAccount: ''
  }

  onMount(() => {
    loadData()
  })

  async function loadData() {
    try {
      loading = true
      
      const [invoicesResponse, ordersResponse] = await Promise.all([
        invoiceApi.list({}),
        orderApi.list({ status: 'checked_out' })
      ])
      
      invoices = invoicesResponse.data.data || []
      orders = ordersResponse.data.data || []
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

  function openCreateModal() {
    newInvoice = {
      orderId: null,
      invoiceType: 'personal',
      title: '',
      taxNumber: '',
      address: '',
      phone: '',
      bankName: '',
      bankAccount: ''
    }
    showCreateModal = true
  }

  async function handleCreateInvoice() {
    if (!newInvoice.orderId || !newInvoice.title) {
      showNotification('请填写必填信息', 'error')
      return
    }

    try {
      loading = true
      
      const order = orders.find(o => o.id === parseInt(newInvoice.orderId))
      
      const invoiceData = {
        orderId: parseInt(newInvoice.orderId),
        amount: order?.total_amount || 0,
        invoiceType: newInvoice.invoiceType,
        title: newInvoice.title,
        taxNumber: newInvoice.taxNumber,
        address: newInvoice.address,
        phone: newInvoice.phone,
        bankName: newInvoice.bankName,
        bankAccount: newInvoice.bankAccount
      }
      
      await invoiceApi.create(invoiceData)
      showNotification('发票创建成功', 'success')
      showCreateModal = false
      await loadData()
    } catch (error) {
      showNotification('创建失败', 'error')
    } finally {
      loading = false
    }
  }

  async function handleIssue(invoice) {
    try {
      await invoiceApi.updateStatus(invoice.id, 'issued')
      showNotification('发票已开具', 'success')
      await loadData()
    } catch (error) {
      showNotification('操作失败', 'error')
    }
  }

  async function handleVoid(invoice) {
    if (!confirm('确定要作废这张发票吗？')) return
    
    try {
      await invoiceApi.updateStatus(invoice.id, 'voided')
      showNotification('发票已作废', 'success')
      await loadData()
    } catch (error) {
      showNotification('操作失败', 'error')
    }
  }

  $: pendingInvoices = invoices.filter(i => i.status === 'pending')
  $: issuedInvoices = invoices.filter(i => i.status === 'issued')
  $: voidedInvoices = invoices.filter(i => i.status === 'voided')

  function getStatusClass(status) {
    const classes = {
      pending: 'status-pending',
      issued: 'status-issued',
      voided: 'status-voided'
    }
    return classes[status] || 'status-pending'
  }

  function getStatusText(status) {
    const texts = {
      pending: '待开具',
      issued: '已开具',
      voided: '已作废'
    }
    return texts[status] || status
  }

  $: {
    if (newInvoice.orderId) {
      const order = orders.find(o => o.id === parseInt(newInvoice.orderId))
      if (order) {
        newInvoice.title = order.guest_name
      }
    }
  }
</script>

<div class="invoice-page">
  {#if notification}
    <div class={`notification ${notification.type}`}>
      {notification.message}
    </div>
  {/if}

  <div class="page-header">
    <h2>📄 发票管理</h2>
    <button class="btn-primary" on:click={openCreateModal}>
      + 新建发票
    </button>
  </div>

  <div class="dashboard-stats">
    <div class="stat-card pending">
      <div class="stat-value">{pendingInvoices.length}</div>
      <div class="stat-label">待开具</div>
    </div>
    <div class="stat-card issued">
      <div class="stat-value">{issuedInvoices.length}</div>
      <div class="stat-label">已开具</div>
    </div>
    <div class="stat-card total">
      <div class="stat-value">¥{invoices.filter(i => i.status === 'issued').reduce((sum, i) => sum + (i.amount || 0), 0).toFixed(2)}</div>
      <div class="stat-label">已开票金额</div>
    </div>
  </div>

  {#if loading}
    <div class="loading">加载中...</div>
  {:else if invoices.length === 0}
    <div class="empty">
      <p>暂无发票数据</p>
    </div>
  {:else}
    <div class="invoice-table-container">
      <table class="invoice-table">
        <thead>
          <tr>
            <th>发票编号</th>
            <th>订单</th>
            <th>开票类型</th>
            <th>抬头</th>
            <th>金额</th>
            <th>状态</th>
            <th>创建时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {#each invoices as invoice}
            <tr>
              <td class="invoice-number">{invoice.invoice_number || '-'}</td>
              <td>
                <div class="order-info">
                  <span class="order-num">#{invoice.order_id}</span>
                  <span class="guest-name">{invoice.title}</span>
                </div>
              </td>
              <td>
                <span class="type-badge">
                  {invoice.invoice_type === 'personal' ? '个人' : '企业'}
                </span>
              </td>
              <td>{invoice.title}</td>
              <td class="amount">¥{invoice.amount?.toFixed(2) || '0.00'}</td>
              <td>
                <span class={`status-badge ${getStatusClass(invoice.status)}`}>
                  {getStatusText(invoice.status)}
                </span>
              </td>
              <td>
                {invoice.created_at ? dayjs(invoice.created_at).format('YYYY-MM-DD') : '-'}
              </td>
              <td class="actions">
                {#if invoice.status === 'pending'}
                  <button class="btn-action" on:click={() => handleIssue(invoice)}>
                    开具
                  </button>
                {:else if invoice.status === 'issued'}
                  <button class="btn-action btn-danger" on:click={() => handleVoid(invoice)}>
                    作废
                  </button>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

  {#if showCreateModal}
    <div class="modal-overlay" on:click={() => showCreateModal = false}>
      <div class="modal" on:click|stopPropagation>
        <div class="modal-header">
          <h3>新建发票</h3>
          <button class="close" on:click={() => showCreateModal = false}>×</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>选择订单 <span class="required">*</span></label>
            <select bind:value={newInvoice.orderId}>
              <option value="">请选择订单</option>
              {#each orders as order}
                <option value={order.id}>
                  {order.order_number} - {order.guest_name} - ¥{order.total_amount}
                </option>
              {/each}
            </select>
          </div>

          <div class="form-group">
            <label>发票类型</label>
            <div class="radio-group">
              <label>
                <input type="radio" bind:group={newInvoice.invoiceType} value="personal" />
                个人
              </label>
              <label>
                <input type="radio" bind:group={newInvoice.invoiceType} value="company" />
                企业
              </label>
            </div>
          </div>

          <div class="form-group">
            <label>发票抬头 <span class="required">*</span></label>
            <input 
              type="text" 
              bind:value={newInvoice.title}
              placeholder="请输入发票抬头"
            />
          </div>

          {#if newInvoice.invoiceType === 'company'}
            <div class="form-group">
              <label>纳税人识别号</label>
              <input 
                type="text" 
                bind:value={newInvoice.taxNumber}
                placeholder="请输入纳税人识别号"
              />
            </div>

            <div class="form-group">
              <label>地址</label>
              <input 
                type="text" 
                bind:value={newInvoice.address}
                placeholder="请输入地址"
              />
            </div>

            <div class="form-group">
              <label>电话</label>
              <input 
                type="text" 
                bind:value={newInvoice.phone}
                placeholder="请输入电话"
              />
            </div>

            <div class="form-group">
              <label>开户银行</label>
              <input 
                type="text" 
                bind:value={newInvoice.bankName}
                placeholder="请输入开户银行"
              />
            </div>

            <div class="form-group">
              <label>银行账号</label>
              <input 
                type="text" 
                bind:value={newInvoice.bankAccount}
                placeholder="请输入银行账号"
              />
            </div>
          {/if}

          {#if newInvoice.orderId}
            {@const order = orders.find(o => o.id === parseInt(newInvoice.orderId))}
            {#if order}
              <div class="price-preview">
                <p>开票金额: <strong>¥{order.total_amount}</strong></p>
              </div>
            {/if}
          {/if}

          <div class="action-buttons">
            <button class="btn" on:click={() => showCreateModal = false}>取消</button>
            <button 
              class="btn btn-primary" 
              on:click={handleCreateInvoice}
              disabled={!newInvoice.orderId || !newInvoice.title}
            >
              创建发票
            </button>
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .invoice-page {
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
  }
  h2 {
    margin: 0;
    color: #333;
  }
  .btn-primary {
    padding: 10px 20px;
    background: #28a745;
    color: white;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    transition: all 0.3s;
  }
  .btn-primary:hover {
    background: #218838;
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
  .stat-card.issued { border-left-color: #28a745; }
  .stat-card.total { border-left-color: #1e3c72; }
  .stat-value {
    font-size: 28px;
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
  .invoice-table-container {
    background: white;
    border-radius: 10px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    overflow-x: auto;
  }
  .invoice-table {
    width: 100%;
    border-collapse: collapse;
  }
  .invoice-table thead {
    background: #f8f9fa;
  }
  .invoice-table th {
    padding: 15px;
    text-align: left;
    font-weight: 600;
    color: #555;
    border-bottom: 2px solid #e0e0e0;
  }
  .invoice-table td {
    padding: 15px;
    border-bottom: 1px solid #f0f0f0;
  }
  .invoice-number {
    font-family: monospace;
    font-size: 13px;
    color: #1e3c72;
    font-weight: 500;
  }
  .order-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .order-num {
    font-size: 12px;
    color: #999;
  }
  .guest-name {
    font-weight: 500;
    color: #333;
  }
  .type-badge {
    padding: 4px 10px;
    border-radius: 12px;
    font-size: 12px;
    background: #e9ecef;
    color: #495057;
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
  .status-issued { background: #d4edda; color: #155724; }
  .status-voided { background: #f8d7da; color: #721c24; }
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
  .btn-action.btn-danger {
    background: #dc3545;
    color: white;
    border-color: #dc3545;
  }
  .btn-action.btn-danger:hover {
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
  .form-group {
    margin-bottom: 15px;
  }
  .form-group label {
    display: block;
    margin-bottom: 5px;
    font-weight: 500;
    color: #555;
  }
  .form-group .required {
    color: #dc3545;
  }
  .form-group select,
  .form-group input {
    width: 100%;
    padding: 10px;
    border: 1px solid #ddd;
    border-radius: 5px;
    font-size: 14px;
  }
  .radio-group {
    display: flex;
    gap: 20px;
    margin-top: 5px;
  }
  .radio-group label {
    display: flex;
    align-items: center;
    gap: 5px;
    cursor: pointer;
    margin: 0;
  }
  .radio-group input {
    width: auto;
  }
  .price-preview {
    background: #f8f9fa;
    padding: 15px;
    border-radius: 8px;
    margin-bottom: 20px;
    text-align: center;
  }
  .price-preview p {
    margin: 0;
    font-size: 16px;
    color: #666;
  }
  .price-preview strong {
    color: #e74c3c;
    font-size: 20px;
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
</style>
