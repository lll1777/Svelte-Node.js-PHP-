import axios from 'axios'

const nodeApi = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json'
  }
})

const phpApi = axios.create({
  baseURL: '/php-api',
  headers: {
    'Content-Type': 'application/json'
  }
})

export const orderApi = {
  create: (data) => nodeApi.post('/orders', data),
  get: (id) => nodeApi.get(`/orders/${id}`),
  list: (params) => nodeApi.get('/orders', { params }),
  updateStatus: (id, status) => nodeApi.patch(`/orders/${id}/status`, { status }),
  checkIn: (id, data) => nodeApi.post(`/orders/${id}/checkin`, data),
  checkOut: (id, data) => nodeApi.post(`/orders/${id}/checkout`, data),
  changeRoom: (id, data) => nodeApi.post(`/orders/${id}/change-room`, data)
}

export const paymentApi = {
  createPayment: (data) => nodeApi.post('/payments', data),
  getPayment: (id) => nodeApi.get(`/payments/${id}`),
  refund: (id, data) => nodeApi.post(`/payments/${id}/refund`, data)
}

export const roomApi = {
  list: (params) => phpApi.get('/rooms', { params }),
  get: (id) => phpApi.get(`/rooms/${id}`),
  getAvailability: (params) => phpApi.get('/rooms/availability', { params }),
  updateStatus: (id, status) => phpApi.patch(`/rooms/${id}/status`, { status }),
  lock: (id, data) => phpApi.post(`/rooms/${id}/lock`, data),
  unlock: (id) => phpApi.post(`/rooms/${id}/unlock`)
}

export const cleaningApi = {
  list: (params) => phpApi.get('/cleaning', { params }),
  create: (data) => phpApi.post('/cleaning', data),
  updateStatus: (id, status) => phpApi.patch(`/cleaning/${id}/status`, { status })
}

export const invoiceApi = {
  list: (params) => phpApi.get('/invoices', { params }),
  get: (id) => phpApi.get(`/invoices/${id}`),
  create: (data) => phpApi.post('/invoices', data),
  updateStatus: (id, status) => phpApi.patch(`/invoices/${id}/status`, { status })
}

export const reportApi = {
  getRevenue: (params) => nodeApi.get('/reports/revenue', { params }),
  getOccupancy: (params) => phpApi.get('/reports/occupancy', { params })
}
