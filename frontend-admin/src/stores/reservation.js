import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import dayjs from 'dayjs'
import { reservations as initialReservations, notifications as initialNotifications } from '@/data/mockData'
import { useBookStore } from '@/stores/book'
import { useReaderStore } from '@/stores/reader'
import { useBorrowStore } from '@/stores/borrow'

const RESERVATION_KEY = 'library_reservations'
const NOTIFICATION_KEY = 'library_notifications'
const OUTAGE_KEY = 'library_notify_outage'

// 取书保留期限（天）：到馆通知发出后，读者需在此期限内到馆确认，超期自动过期并顺延
export const PICKUP_HOLD_DAYS = 3
// 模拟通知渠道的随机失败率（用于演示发送中断场景）
const NOTIFY_FAIL_RATE = 0.15

const now = () => dayjs().format('YYYY-MM-DD HH:mm:ss')

function loadList(key, fallback) {
  const stored = localStorage.getItem(key)
  if (stored) {
    try {
      return JSON.parse(stored)
    } catch (e) {
      console.error(`Failed to parse stored data for ${key}:`, e)
    }
  }
  return [...fallback]
}

export const useReservationStore = defineStore('reservation', () => {
  const bookStore = useBookStore()
  const readerStore = useReaderStore()
  const borrowStore = useBorrowStore()

  const reservations = ref(loadList(RESERVATION_KEY, initialReservations))
  const notifications = ref(loadList(NOTIFICATION_KEY, initialNotifications))
  // 模拟通知服务中断开关：开启后所有到馆通知发送失败（可在通知记录中重试）
  const simulateOutage = ref(localStorage.getItem(OUTAGE_KEY) === '1')

  watch(reservations, (val) => {
    localStorage.setItem(RESERVATION_KEY, JSON.stringify(val))
  }, { deep: true })

  watch(notifications, (val) => {
    localStorage.setItem(NOTIFICATION_KEY, JSON.stringify(val))
  }, { deep: true })

  watch(simulateOutage, (val) => {
    localStorage.setItem(OUTAGE_KEY, val ? '1' : '0')
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
    const today = dayjs().format('YYYY-MM-DD')
    return reservations.value.filter(r =>
      r.status === 'fulfilled' && r.finishedAt && r.finishedAt.startsWith(today)
    ).length
  })
  const failedNotifyCount = computed(() =>
    notifications.value.filter(n => n.status === 'failed').length
  )

  // ========================================
  // 队列（按登记时间排序，队首优先；位次由计算得出，不落库，避免状态错位）
  // ========================================
  function waitingQueue(bookId) {
    return reservations.value
      .filter(r => r.bookId === bookId && r.status === 'waiting')
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id)
  }

  // 排队位次：waiting → 第 N 位；notified → 0（已轮到）；终态 → null
  function getQueuePosition(reservation) {
    if (reservation.status === 'notified') return 0
    if (reservation.status !== 'waiting') return null
    const queue = waitingQueue(reservation.bookId)
    const index = queue.findIndex(r => r.id === reservation.id)
    return index === -1 ? null : index + 1
  }

  function getQueueCount(bookId) {
    return waitingQueue(bookId).length
  }

  function getActiveByReader(readerId) {
    return reservations.value.filter(r =>
      r.readerId === readerId && (r.status === 'waiting' || r.status === 'notified')
    )
  }

  // ========================================
  // 通知渠道（模拟发送，可能中断；失败的记录保留重试入口）
  // ========================================
  function sendThroughChannel() {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (simulateOutage.value) {
          reject(new Error('通知服务维护中，发送中断'))
        } else if (Math.random() < NOTIFY_FAIL_RATE) {
          reject(new Error('网络波动，通知发送中断'))
        } else {
          resolve()
        }
      }, 500)
    })
  }

  async function dispatchNotification(record) {
    try {
      await sendThroughChannel()
      record.status = 'sent'
      record.sentAt = now()
      record.error = null
    } catch (e) {
      record.status = 'failed'
      record.error = e.message
    }
  }

  function createNotification(reservation) {
    const newId = notifications.value.length > 0
      ? Math.max(...notifications.value.map(n => n.id)) + 1
      : 1
    const record = {
      id: newId,
      reservationId: reservation.id,
      readerId: reservation.readerId,
      readerName: reservation.readerName,
      bookId: reservation.bookId,
      bookTitle: reservation.bookTitle,
      type: 'arrival',
      status: 'sending',
      retryCount: 0,
      createdAt: now(),
      sentAt: null,
      error: null
    }
    notifications.value.unshift(record)
    dispatchNotification(record)
    return record
  }

  // 重试入口：仅发送失败的通知可重试
  function retryNotification(id) {
    const record = notifications.value.find(n => n.id === id)
    if (!record || record.status !== 'failed') return false
    record.status = 'sending'
    record.retryCount += 1
    record.error = null
    dispatchNotification(record)
    return true
  }

  // ========================================
  // 库存分配：可借库存 > 0 且存在候补时，严格按登记顺序逐个分配给队首
  // （库存竞争的唯一入口，保证队列顺序不被打乱）
  // ========================================
  function allocate(bookId) {
    const allocated = []
    let book = bookStore.getBookById(bookId)
    if (!book) return allocated
    while (book.available > 0) {
      const head = waitingQueue(bookId)[0]
      if (!head) break
      head.status = 'notified'
      head.notifiedAt = now()
      head.expireAt = dayjs().add(PICKUP_HOLD_DAYS, 'day').format('YYYY-MM-DD HH:mm:ss')
      // 副本转为「预约保留」，不再计入可借库存，避免被直接借阅抢走
      bookStore.updateBook(bookId, { available: book.available - 1 })
      createNotification(head)
      allocated.push(head)
      book = bookStore.getBookById(bookId)
    }
    return allocated
  }

  // 库存释放入口（归还图书时调用）：释放的副本优先顺延给候补队首，否则回到可借库存
  function releaseStock(bookId) {
    const book = bookStore.getBookById(bookId)
    if (!book) return { allocated: false, to: null }
    bookStore.updateBook(bookId, { available: book.available + 1 })
    const allocated = allocate(bookId)
    return { allocated: allocated.length > 0, to: allocated[0] || null }
  }

  // 释放为预约保留的副本（取消/过期时）：回到库存并立即尝试顺延给下一位
  function releaseHeldCopy(bookId) {
    const book = bookStore.getBookById(bookId)
    if (!book) return
    bookStore.updateBook(bookId, { available: book.available + 1 })
    allocate(bookId)
  }

  // ========================================
  // 预约登记（仅无库存馆藏；同一读者同一图书不可重复预约）
  // ========================================
  function addReservation({ readerId, bookId }) {
    const reader = readerStore.getReaderById(readerId)
    const book = bookStore.getBookById(bookId)
    if (!reader || !book) {
      return { ok: false, message: '读者或图书信息不存在' }
    }
    if (reader.status !== 'active') {
      return { ok: false, message: `读者「${reader.name}」借书证已过期，无法登记预约` }
    }
    if (book.available > 0) {
      return { ok: false, message: '该图书当前有可借库存，请直接办理借阅' }
    }
    const duplicate = reservations.value.find(r =>
      r.readerId === readerId && r.bookId === bookId &&
      (r.status === 'waiting' || r.status === 'notified')
    )
    if (duplicate) {
      return { ok: false, message: `读者「${reader.name}」已存在该图书的进行中预约，请勿重复登记` }
    }
    const newId = reservations.value.length > 0
      ? Math.max(...reservations.value.map(r => r.id)) + 1
      : 1
    const record = {
      id: newId,
      readerId: reader.id,
      readerName: reader.name,
      cardNo: reader.cardNo,
      bookId: book.id,
      bookTitle: book.title,
      isbn: book.isbn,
      status: 'waiting',
      createdAt: now(),
      notifiedAt: null,
      expireAt: null,
      finishedAt: null
    }
    reservations.value.push(record)
    return { ok: true, id: newId, position: getQueuePosition(record) }
  }

  // ========================================
  // 取消：排队中直接取消；待取书取消后释放保留副本并顺延下一位
  // ========================================
  function cancelReservation(id) {
    const record = reservations.value.find(r => r.id === id)
    if (!record) return { ok: false, message: '预约记录不存在' }
    if (record.status !== 'waiting' && record.status !== 'notified') {
      return { ok: false, message: '当前状态不可取消' }
    }
    const wasNotified = record.status === 'notified'
    record.status = 'cancelled'
    record.finishedAt = now()
    if (wasNotified) {
      releaseHeldCopy(record.bookId)
    }
    return { ok: true, released: wasNotified }
  }

  // ========================================
  // 到馆确认：转为借阅记录（保留副本直接借出，不占用可借库存）
  // ========================================
  function confirmArrival(id) {
    const record = reservations.value.find(r => r.id === id)
    if (!record) return { ok: false, message: '预约记录不存在' }
    if (record.status !== 'notified') {
      return { ok: false, message: '仅「待取书」状态的预约可办理到馆确认' }
    }
    // 确认前再次校验取书期限，防止过期后状态错位
    if (record.expireAt && !dayjs(record.expireAt).isAfter(dayjs())) {
      expireReservation(record)
      return { ok: false, message: '该预约已超过取书期限，已自动过期并顺延下一位候补读者' }
    }
    borrowStore.addRecord({
      readerId: record.readerId,
      readerName: record.readerName,
      cardNo: record.cardNo,
      bookId: record.bookId,
      bookTitle: record.bookTitle,
      isbn: record.isbn
    })
    const reader = readerStore.getReaderById(record.readerId)
    if (reader) {
      readerStore.updateReader(reader.id, { borrowCount: reader.borrowCount + 1 })
    }
    record.status = 'fulfilled'
    record.finishedAt = now()
    return { ok: true }
  }

  // ========================================
  // 过期：超期未取 → 释放保留副本 → 顺延下一位候补
  // ========================================
  function expireReservation(record) {
    record.status = 'expired'
    record.finishedAt = now()
    releaseHeldCopy(record.bookId)
  }

  function expireOverdue() {
    const current = dayjs()
    let count = 0
    for (const record of [...reservations.value]) {
      if (record.status === 'notified' && record.expireAt && !dayjs(record.expireAt).isAfter(current)) {
        expireReservation(record)
        count += 1
      }
    }
    return count
  }

  // ========================================
  // 状态对齐：进入系统/页面时调用，保证刷新或重新进入后预约状态不错位
  // ========================================
  function reconcile() {
    // 1. 上次退出前仍处于「发送中」的通知 → 标记为失败，保留重试入口
    notifications.value.forEach(n => {
      if (n.status === 'sending') {
        n.status = 'failed'
        n.error = '通知发送中断（页面已关闭），请手动重试'
      }
    })
    // 2. 处理已超期的待取书预约（释放库存并按顺序顺延）
    expireOverdue()
    // 3. 可借库存与候补队列对齐（如管理员在图书管理中调整过库存）
    const bookIds = [...new Set(
      reservations.value.filter(r => r.status === 'waiting').map(r => r.bookId)
    )]
    bookIds.forEach(id => allocate(id))
  }

  //  store 初始化时立即对齐一次
  reconcile()

  return {
    reservations,
    notifications,
    simulateOutage,
    waitingCount,
    notifiedCount,
    todayFulfilledCount,
    failedNotifyCount,
    waitingQueue,
    getQueuePosition,
    getQueueCount,
    getActiveByReader,
    addReservation,
    cancelReservation,
    confirmArrival,
    releaseStock,
    expireOverdue,
    reconcile,
    retryNotification
  }
})
