import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { reservations as initialReservations, notifications as initialNotifications } from '@/data/mockData'
import { useBookStore } from '@/stores/book'
import { useReaderStore } from '@/stores/reader'
import { useBorrowStore } from '@/stores/borrow'

const RESERVATION_KEY = 'library_reservations'
const NOTIFICATION_KEY = 'library_notifications'
const CHANNEL_KEY = 'library_notification_channel'

// 到馆通知生成后，读者需在 N 天内到馆确认，逾期自动释放
export const PICKUP_DAYS = 3
// 通知发送失败后的最大重试次数
export const MAX_RETRY = 5

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

function nowStr() {
  return new Date().toISOString()
}

function addDays(dateStr, days) {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

function nextId(list) {
  return list.length > 0 ? Math.max(...list.map(item => item.id)) + 1 : 1
}

export const useReservationStore = defineStore('reservation', () => {
  const bookStore = useBookStore()
  const readerStore = useReaderStore()
  const borrowStore = useBorrowStore()

  const loadReservations = () => {
    const stored = localStorage.getItem(RESERVATION_KEY)
    if (stored) {
      try {
        return JSON.parse(stored)
      } catch (e) {
        console.error('Failed to parse stored reservations:', e)
      }
    }
    return [...initialReservations]
  }

  const loadNotifications = () => {
    const stored = localStorage.getItem(NOTIFICATION_KEY)
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        // 上次会话中停留在"发送中"的通知，说明发送被中断（页面关闭/刷新），
        // 重新进入时统一落为"发送失败"，保留重试入口，避免状态悬空
        return parsed.map(n =>
          n.status === 'sending'
            ? { ...n, status: 'failed', lastError: n.lastError || '通知发送中断，请重试' }
            : n
        )
      } catch (e) {
        console.error('Failed to parse stored notifications:', e)
      }
    }
    return [...initialNotifications]
  }

  const reservations = ref(loadReservations())
  const notifications = ref(loadNotifications())
  // 通知通道开关：用于模拟通知发送中断场景（true = 通道中断，发送必失败）
  const channelDown = ref(localStorage.getItem(CHANNEL_KEY) === 'down')

  watch(reservations, (newList) => {
    localStorage.setItem(RESERVATION_KEY, JSON.stringify(newList))
  }, { deep: true })

  watch(notifications, (newList) => {
    localStorage.setItem(NOTIFICATION_KEY, JSON.stringify(newList))
  }, { deep: true })

  watch(channelDown, (down) => {
    localStorage.setItem(CHANNEL_KEY, down ? 'down' : 'up')
  })

  // ========================================
  // 统计
  // ========================================
  const waitingCount = computed(() =>
    reservations.value.filter(r => r.status === 'waiting').length
  )

  const notifiedCount = computed(() =>
    reservations.value.filter(r => r.status === 'notified').length
  )

  const todayFulfilledCount = computed(() => {
    const today = todayStr()
    return reservations.value.filter(r =>
      r.status === 'fulfilled' && r.fulfilledAt && r.fulfilledAt.startsWith(today)
    ).length
  })

  const expiredCount = computed(() =>
    reservations.value.filter(r => r.status === 'expired').length
  )

  const failedNotificationCount = computed(() =>
    notifications.value.filter(n => n.status === 'failed').length
  )

  // ========================================
  // 查询
  // ========================================
  function getReservationById(id) {
    return reservations.value.find(r => r.id === id)
  }

  // 同一读者对同一图书的进行中预约（候补或待到馆），用于重复预约拦截
  function getActiveReservation(readerId, bookId) {
    return reservations.value.find(r =>
      r.readerId === readerId &&
      r.bookId === bookId &&
      (r.status === 'waiting' || r.status === 'notified')
    )
  }

  // 某图书的候补队列：queueNo 单调递增且永不复用，按 queueNo 排序即候补顺序
  function getQueueByBook(bookId) {
    return reservations.value
      .filter(r => r.bookId === bookId && r.status === 'waiting')
      .sort((a, b) => a.queueNo - b.queueNo)
  }

  // 候补位置（从 1 开始）；非候补状态返回 null
  function getQueuePosition(reservation) {
    if (!reservation || reservation.status !== 'waiting') return null
    const queue = getQueueByBook(reservation.bookId)
    const index = queue.findIndex(r => r.id === reservation.id)
    return index === -1 ? null : index + 1
  }

  function getNotificationsByReservation(reservationId) {
    return notifications.value
      .filter(n => n.reservationId === reservationId)
      .sort((a, b) => b.id - a.id)
  }

  function getLatestNotification(reservationId) {
    return getNotificationsByReservation(reservationId)[0] || null
  }

  // ========================================
  // 预约登记
  // ========================================
  function addReservation({ readerId, bookId }) {
    const reader = readerStore.getReaderById(readerId)
    const book = bookStore.getBookById(bookId)

    if (!reader) return { ok: false, error: '读者信息不存在' }
    if (reader.status !== 'active') return { ok: false, error: '该读者证已过期，无法登记预约' }
    if (!book) return { ok: false, error: '馆藏条目不存在' }
    if (book.available > 0) {
      return { ok: false, error: '该图书当前有在架库存，可直接办理借阅，无需预约' }
    }

    // 重复预约拦截（幂等）：返回已存在的进行中的预约，不产生新记录
    const existing = getActiveReservation(readerId, bookId)
    if (existing) {
      return {
        ok: false,
        duplicate: true,
        reservation: existing,
        error: existing.status === 'waiting'
          ? `该读者已在候补队列中（第 ${getQueuePosition(existing)} 位），请勿重复预约`
          : '该读者已有待到馆的预约，请勿重复预约'
      }
    }

    // 已借阅未还的读者无需再预约同一本书
    const borrowing = borrowStore.records.some(r =>
      r.readerId === readerId &&
      r.bookId === bookId &&
      (r.status === 'borrowed' || r.status === 'overdue')
    )
    if (borrowing) {
      return { ok: false, error: '该读者已借阅此图书且尚未归还，无需预约' }
    }

    const bookQueueNos = reservations.value
      .filter(r => r.bookId === bookId)
      .map(r => r.queueNo)
    const reservation = {
      id: nextId(reservations.value),
      readerId: reader.id,
      readerName: reader.name,
      cardNo: reader.cardNo,
      bookId: book.id,
      bookTitle: book.title,
      isbn: book.isbn,
      status: 'waiting',
      queueNo: bookQueueNos.length > 0 ? Math.max(...bookQueueNos) + 1 : 1,
      reserveDate: todayStr(),
      createdAt: nowStr(),
      notifiedAt: null,
      expireDate: null,
      fulfilledAt: null,
      cancelledAt: null,
      expiredAt: null,
      cancelReason: null,
      borrowRecordId: null
    }
    reservations.value.push(reservation)

    // 防御性校正：若登记瞬间库存已被释放（如并发归还），立即按序分配
    processQueue(bookId)

    return { ok: true, reservation }
  }

  // ========================================
  // 取消预约
  // ========================================
  function cancelReservation(id, reason = '读者主动取消') {
    const reservation = getReservationById(id)
    if (!reservation) return { ok: false, error: '预约记录不存在' }
    // 幂等：终态（已到馆/已取消/已过期）重复取消直接失败，不产生副作用
    if (reservation.status !== 'waiting' && reservation.status !== 'notified') {
      return { ok: false, error: '当前状态不可取消' }
    }

    const wasNotified = reservation.status === 'notified'
    reservation.status = 'cancelled'
    reservation.cancelledAt = nowStr()
    reservation.cancelReason = reason

    // 待到馆的预约已预扣库存，取消后释放并顺延通知下一位候补
    let notifiedNext = 0
    if (wasNotified) {
      notifiedNext = releaseHold(reservation.bookId)
    }
    return { ok: true, notifiedNext }
  }

  // ========================================
  // 到馆确认（转为借阅）
  // ========================================
  function confirmArrival(id) {
    const reservation = getReservationById(id)
    if (!reservation) return { ok: false, error: '预约记录不存在' }
    // 幂等：重复确认直接返回成功，不重复生成借阅记录
    if (reservation.status === 'fulfilled') {
      return { ok: true, duplicated: true, reservation }
    }
    if (reservation.status !== 'notified') {
      return { ok: false, error: '仅"待到馆"状态的预约可办理到馆确认' }
    }

    const reader = readerStore.getReaderById(reservation.readerId)
    const book = bookStore.getBookById(reservation.bookId)
    if (!reader) return { ok: false, error: '读者信息不存在，无法办理到馆确认' }
    if (!book) return { ok: false, error: '馆藏条目不存在，无法办理到馆确认' }
    if (reader.borrowCount >= reader.maxBorrow) {
      return { ok: false, error: `该读者已达最大借阅册数（${reader.maxBorrow} 册），无法到馆确认` }
    }

    // 库存在生成到馆通知时已为该预约预扣，此处直接转为借阅，不再变动库存
    const borrowId = borrowStore.addRecord({
      readerId: reader.id,
      readerName: reader.name,
      cardNo: reader.cardNo,
      bookId: book.id,
      bookTitle: book.title,
      isbn: book.isbn
    })
    readerStore.updateReader(reader.id, { borrowCount: reader.borrowCount + 1 })

    reservation.status = 'fulfilled'
    reservation.fulfilledAt = nowStr()
    reservation.borrowRecordId = borrowId
    return { ok: true, reservation }
  }

  // ========================================
  // 过期扫描：待到馆超过保留期限自动过期，库存顺延给下一位
  // ========================================
  function sweepExpired() {
    const today = todayStr()
    const affectedBookIds = new Set()
    reservations.value.forEach(r => {
      if (r.status === 'notified' && r.expireDate && r.expireDate < today) {
        r.status = 'expired'
        r.expiredAt = nowStr()
        affectedBookIds.add(r.bookId)
      }
    })
    let notifiedNext = 0
    affectedBookIds.forEach(bookId => {
      notifiedNext += releaseHold(bookId)
    })
    return { expiredCount: affectedBookIds.size, notifiedNext }
  }

  // ========================================
  // 队列分配：库存释放后按候补顺序生成到馆通知
  // ========================================
  function processQueue(bookId) {
    let allocated = 0
    // 串行分配：每轮重新读取库存与队首，库存不足或队列空即停止，
    // 保证库存竞争时不会超发通知
    while (true) {
      const book = bookStore.getBookById(bookId)
      if (!book || book.available <= 0) break
      const next = getQueueByBook(bookId)[0]
      if (!next) break

      bookStore.updateBook(bookId, { available: book.available - 1 })
      next.status = 'notified'
      next.notifiedAt = nowStr()
      next.expireDate = addDays(todayStr(), PICKUP_DAYS)
      createNotification(next)
      allocated += 1
    }
    return allocated
  }

  // 释放待到馆预约预扣的库存，并尝试顺延给下一位候补
  function releaseHold(bookId) {
    const book = bookStore.getBookById(bookId)
    if (book) {
      bookStore.updateBook(bookId, { available: Math.min(book.total, book.available + 1) })
    }
    return processQueue(bookId)
  }

  // 重新进入（刷新/重登）时的状态校正：
  // 1. 扫描并处理已过期的待到馆预约
  // 2. 对仍有候补的图书重新核对库存，修正"有库存但未分配"的错位状态
  function reconcile() {
    const result = sweepExpired()
    const waitingBookIds = [...new Set(
      reservations.value.filter(r => r.status === 'waiting').map(r => r.bookId)
    )]
    waitingBookIds.forEach(bookId => {
      result.notifiedNext += processQueue(bookId)
    })
    return result
  }

  // ========================================
  // 到馆通知
  // ========================================
  function createNotification(reservation) {
    const notification = {
      id: nextId(notifications.value),
      reservationId: reservation.id,
      readerId: reservation.readerId,
      readerName: reservation.readerName,
      bookId: reservation.bookId,
      bookTitle: reservation.bookTitle,
      type: 'arrival',
      status: 'sending',
      retryCount: 0,
      createdAt: nowStr(),
      sentAt: null,
      lastError: null
    }
    notifications.value.push(notification)
    dispatchNotification(notification.id)
    return notification
  }

  // 模拟异步发送：通道中断时发送失败，保留重试入口
  function dispatchNotification(notificationId) {
    const notification = notifications.value.find(n => n.id === notificationId)
    if (!notification) return
    notification.status = 'sending'
    setTimeout(() => {
      const current = notifications.value.find(n => n.id === notificationId)
      if (!current) return
      if (channelDown.value) {
        current.status = 'failed'
        current.retryCount += 1
        current.lastError = '通知通道中断：发送超时，请稍后重试'
      } else {
        current.status = 'sent'
        current.sentAt = nowStr()
        current.lastError = null
      }
    }, 600)
  }

  // 发送失败的通知可重试（重试入口）
  function retryNotification(notificationId) {
    const notification = notifications.value.find(n => n.id === notificationId)
    if (!notification) return { ok: false, error: '通知记录不存在' }
    if (notification.status !== 'failed') {
      return { ok: false, error: '仅发送失败的通知可重试' }
    }
    if (notification.retryCount >= MAX_RETRY) {
      return { ok: false, error: `已达最大重试次数（${MAX_RETRY} 次）` }
    }
    dispatchNotification(notificationId)
    return { ok: true }
  }

  function setChannelDown(down) {
    channelDown.value = down
  }

  // 初始化时校正一次，保证从 localStorage 恢复的状态不错位
  reconcile()

  return {
    reservations,
    notifications,
    channelDown,
    waitingCount,
    notifiedCount,
    todayFulfilledCount,
    expiredCount,
    failedNotificationCount,
    getReservationById,
    getActiveReservation,
    getQueueByBook,
    getQueuePosition,
    getNotificationsByReservation,
    getLatestNotification,
    addReservation,
    cancelReservation,
    confirmArrival,
    sweepExpired,
    processQueue,
    reconcile,
    retryNotification,
    setChannelDown
  }
})
