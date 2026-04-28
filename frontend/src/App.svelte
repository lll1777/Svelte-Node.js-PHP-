<script>
  import { onMount } from 'svelte'
  import Navigation from './components/Navigation.svelte'
  import BookingPage from './pages/BookingPage.svelte'
  import RoomStatusPage from './pages/RoomStatusPage.svelte'
  import OrderListPage from './pages/OrderListPage.svelte'
  import CheckInPage from './pages/CheckInPage.svelte'
  import CleaningPage from './pages/CleaningPage.svelte'
  import InvoicePage from './pages/InvoicePage.svelte'
  import ReportPage from './pages/ReportPage.svelte'

  let currentPage = 'booking'
  let pages = {
    booking: BookingPage,
    roomStatus: RoomStatusPage,
    orders: OrderListPage,
    checkIn: CheckInPage,
    cleaning: CleaningPage,
    invoices: InvoicePage,
    reports: ReportPage
  }

  $: ActivePage = pages[currentPage]

  function handleNavigation(page) {
    currentPage = page
  }

  onMount(() => {
    console.log('酒店预订管理系统已启动')
  })
</script>

<main>
  <Navigation {currentPage} onNavigate={handleNavigation} />
  <div class="content">
    <ActivePage />
  </div>
</main>

<style>
  main {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }
  .content {
    flex: 1;
    padding: 20px;
  }
</style>
