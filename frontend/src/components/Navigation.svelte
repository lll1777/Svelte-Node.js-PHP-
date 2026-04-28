<script>
  export let currentPage
  export let onNavigate

  const menuItems = [
    { id: 'booking', label: '预订管理', icon: '📅' },
    { id: 'roomStatus', label: '房态图', icon: '🏨' },
    { id: 'orders', label: '订单列表', icon: '📋' },
    { id: 'checkIn', label: '入住管理', icon: '🛏️' },
    { id: 'cleaning', label: '清洁管理', icon: '🧹' },
    { id: 'invoices', label: '发票管理', icon: '📄' },
    { id: 'reports', label: '营收报表', icon: '📊' }
  ]
</script>

<nav>
  <div class="logo">
    <h1>🏨 酒店PMS系统</h1>
  </div>
  <ul class="menu">
    {#each menuItems as item}
      <li 
        class:active={currentPage === item.id}
        on:click={() => onNavigate(item.id)}
      >
        <span class="icon">{item.icon}</span>
        <span class="label">{item.label}</span>
      </li>
    {/each}
  </ul>
</nav>

<style>
  nav {
    background: linear-gradient(135deg, #1e3c72, #2a5298);
    color: white;
    padding: 0 20px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
  }
  .logo h1 {
    font-size: 1.4rem;
    font-weight: 600;
  }
  .menu {
    display: flex;
    list-style: none;
    gap: 5px;
  }
  .menu li {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 15px 20px;
    cursor: pointer;
    border-radius: 5px 5px 0 0;
    transition: all 0.3s ease;
    opacity: 0.8;
  }
  .menu li:hover {
    background: rgba(255,255,255,0.1);
    opacity: 1;
  }
  .menu li.active {
    background: rgba(255,255,255,0.2);
    opacity: 1;
    font-weight: 500;
  }
  .menu .icon {
    font-size: 1.2rem;
  }
  .menu .label {
    font-size: 0.95rem;
  }
  @media (max-width: 1200px) {
    .menu .label {
      display: none;
    }
  }
</style>
