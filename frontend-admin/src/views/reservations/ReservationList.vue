<template>
  <div class="reservation-list">
    <h2 class="page-title">预约管理</h2>

    <!-- 统计卡片 -->
    <a-row :gutter="[16, 16]" class="stat-row">
      <a-col :xs="12" :sm="12" :md="6">
        <div class="stat-card-rich waiting">
          <div class="stat-card-header">
            <div class="stat-card-icon">
              <OrderedListOutlined />
            </div>
          </div>
          <div class="stat-card-body">
            <div class="stat-card-value">{{ reservationStore.waitingCount }}</div>
            <div class="stat-card-label">排队中</div>
          </div>
          <div class="stat-card-footer">
            <span>按登记顺序候补</span>
          </div>
        </div>
      </a-col>
      <a-col :xs="12" :sm="12" :md="6">
        <div class="stat-card-rich notified">
          <div class="stat-card-header">
            <div class="stat-card-icon">
              <BellOutlined />
            </div>
            <div class="stat-card-badge" v-if="reservationStore.notifiedCount > 0">
              <ClockCircleOutlined />
            </div>
          </div>
          <div class="stat-card-body">
            <div class="stat-card-value">{{ reservationStore.notifiedCount }}</div>
            <div class="stat-card-label">待取书</div>
          </div>
          <div class="stat-card-footer">
            <span>取书保留 {{ PICKUP_HOLD_DAYS }} 天</span>
          </div>
        </div>
      </a-col>
      <a-col :xs="12" :sm="12" :md="6">
        <div class="stat-card-rich fulfilled">
          <div class="stat-card-header">
            <div class="stat-card-icon">
              <CheckCircleOutlined />
            </div>
          </div>
          <div class="stat-card-body">
            <div class="stat-card-value">{{ reservationStore.todayFulfilledCount }}</div>
            <div class="stat-card-label">今日到馆</div>
          </div>
          <div class="stat-card-footer">
            <span>确认后自动办理借阅</span>
          </div>
        </div>
      </a-col>
      <a-col :xs="12" :sm="12" :md="6">
        <div class="stat-card-rich failed">
          <div class="stat-card-header">
            <div class="stat-card-icon">
              <ExclamationCircleOutlined />
            </div>
            <div class="stat-card-badge warning" v-if="reservationStore.failedNotifyCount > 0">
              <WarningOutlined />
            </div>
          </div>
          <div class="stat-card-body">
            <div class="stat-card-value">{{ reservationStore.failedNotifyCount }}</div>
            <div class="stat-card-label">通知失败</div>
          </div>
          <div class="stat-card-footer">
            <span v-if="reservationStore.failedNotifyCount > 0" class="warning-text">
              <AlertOutlined /> 可在通知记录中重试
            </span>
            <span v-else class="success-text">
              <CheckOutlined /> 通知渠道正常
            </span>
          </div>
        </div>
      </a-col>
    </a-row>

    <!-- 操作工具栏 -->
    <div class="search-area animate-slide-down">
      <a-row :gutter="16" align="middle">
        <a-col :xs="24" :sm="24" :md="12">
          <a-space wrap>
            <a-button type="primary" @click="showReserveModal" class="add-btn">
              <PlusOutlined /> 新增预约
            </a-button>
            <a-button @click="handleCheckExpired">
              <FieldTimeOutlined /> 检查过期
            </a-button>
          </a-space>
        </a-col>
        <a-col :xs="24" :sm="24" :md="12" style="text-align: right;">
          <span class="outage-switch">
            <span class="outage-label">
              模拟通知中断
              <a-tooltip title="开启后所有到馆通知将发送失败，可在「通知记录」中手动重试">
                <QuestionCircleOutlined />
              </a-tooltip>
            </span>
            <a-switch v-model:checked="reservationStore.simulateOutage" />
          </span>
        </a-col>
      </a-row>
    </div>

    <!-- 数据区 -->
    <div class="table-container animate-fade-in">
      <a-tabs v-model:activeKey="activeTab">
        <!-- 预约队列 -->
        <a-tab-pane key="list">
          <template #tab>
            <span>
              <ScheduleOutlined />
              预约队列
            </span>
          </template>

          <a-row :gutter="16" align="middle" class="filter-row">
            <a-col :xs="24" :sm="12" :md="7" :lg="6">
              <a-input
                v-model:value="searchKeyword"
                placeholder="搜索读者、图书、卡号"
                allow-clear
              >
                <template #suffix>
                  <SearchOutlined class="search-icon" />
                </template>
              </a-input>
            </a-col>
            <a-col :xs="24" :sm="12" :md="5" :lg="4">
              <a-select
                v-model:value="selectedStatus"
                placeholder="选择状态"
                allow-clear
                style="width: 100%"
              >
                <a-select-option value="waiting">排队中</a-select-option>
                <a-select-option value="notified">待取书</a-select-option>
                <a-select-option value="fulfilled">已到馆</a-select-option>
                <a-select-option value="cancelled">已取消</a-select-option>
                <a-select-option value="expired">已过期</a-select-option>
              </a-select>
            </a-col>
            <a-col :xs="24" :sm="12" :md="7" :lg="6">
              <a-select
                v-model:value="selectedBookId"
                placeholder="按图书查看队列"
                allow-clear
                style="width: 100%"
              >
                <a-select-option
                  v-for="book in reservedBookOptions"
                  :key="book.id"
                  :value="book.id"
                >
                  {{ book.title }}
                </a-select-option>
              </a-select>
            </a-col>
            <a-col :xs="24" :sm="24" :md="24" :lg="8" class="filter-tip-col">
              <transition name="fade-slide">
                <div v-if="hasFilters" class="search-result-tip">
                  <span class="result-count">
                    找到 <strong>{{ filteredReservations.length }}</strong> 条结果
                  </span>
                  <a-button type="link" size="small" @click="clearFilters" class="clear-btn">
                    清除筛选
                  </a-button>
                </div>
              </transition>
            </a-col>
          </a-row>

          <a-table
            :columns="reservationColumns"
            :data-source="filteredReservations"
            row-key="id"
            :pagination="{ pageSize: 10, showTotal: total => `共 ${total} 条` }"
            :scroll="{ x: 1150 }"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'reader'">
                <div class="text-primary">{{ record.readerName }}</div>
                <div class="text-secondary">{{ record.cardNo }}</div>
              </template>
              <template v-else-if="column.key === 'book'">
                <div class="text-primary">{{ record.bookTitle }}</div>
                <div class="text-secondary">{{ record.isbn }}</div>
              </template>
              <template v-else-if="column.key === 'position'">
                <a-tag v-if="positionOf(record) === 0" color="processing" class="position-tag">
                  已轮到
                </a-tag>
                <a-tag v-else-if="positionOf(record) !== null" color="gold" class="position-tag">
                  第 {{ positionOf(record) }} 位
                </a-tag>
                <span v-else class="text-secondary">—</span>
              </template>
              <template v-else-if="column.key === 'status'">
                <a-tag :color="statusColor(record.status)">{{ statusText(record.status) }}</a-tag>
              </template>
              <template v-else-if="column.key === 'notifiedAt'">
                <span>{{ record.notifiedAt || '—' }}</span>
              </template>
              <template v-else-if="column.key === 'expireAt'">
                <template v-if="record.expireAt">
                  <div>{{ record.expireAt }}</div>
                  <div v-if="record.status === 'notified'" :class="['expire-hint', { urgent: isExpiringSoon(record) }]">
                    {{ expireHint(record) }}
                  </div>
                </template>
                <span v-else>—</span>
              </template>
              <template v-else-if="column.key === 'action'">
                <a-space>
                  <a-popconfirm
                    v-if="record.status === 'notified'"
                    title="确认读者已到馆取书？"
                    ok-text="确认到馆"
                    cancel-text="取消"
                    @confirm="handleConfirmArrival(record)"
                  >
                    <a-button type="link" size="small" class="table-action-btn">
                      <CheckOutlined /> 到馆确认
                    </a-button>
                  </a-popconfirm>
                  <a-popconfirm
                    v-if="record.status === 'waiting' || record.status === 'notified'"
                    :title="record.status === 'notified' ? '取消后保留副本将顺延给下一位候补读者，确定取消？' : '确定取消该预约？'"
                    ok-text="确定"
                    cancel-text="再想想"
                    @confirm="handleCancel(record)"
                  >
                    <a-button type="link" size="small" danger class="table-action-btn">
                      <CloseOutlined /> 取消
                    </a-button>
                  </a-popconfirm>
                  <span v-if="isTerminal(record.status)" class="completed-text">
                    <CheckCircleOutlined /> 已完结
                  </span>
                </a-space>
              </template>
            </template>
          </a-table>
        </a-tab-pane>

        <!-- 通知记录 -->
        <a-tab-pane key="notifications">
          <template #tab>
            <span>
              <SoundOutlined />
              通知记录
              <a-badge
                v-if="reservationStore.failedNotifyCount > 0"
                :count="reservationStore.failedNotifyCount"
                :offset="[8, -2]"
              />
            </span>
          </template>

          <a-row :gutter="16" align="middle" class="filter-row">
            <a-col :xs="24" :sm="12" :md="7" :lg="6">
              <a-input
                v-model:value="notifyKeyword"
                placeholder="搜索读者、图书"
                allow-clear
              >
                <template #suffix>
                  <SearchOutlined class="search-icon" />
                </template>
              </a-input>
            </a-col>
            <a-col :xs="24" :sm="12" :md="5" :lg="4">
              <a-select
                v-model:value="notifyStatus"
                placeholder="发送状态"
                allow-clear
                style="width: 100%"
              >
                <a-select-option value="sending">发送中</a-select-option>
                <a-select-option value="sent">已发送</a-select-option>
                <a-select-option value="failed">发送失败</a-select-option>
              </a-select>
            </a-col>
          </a-row>

          <a-table
            :columns="notificationColumns"
            :data-source="filteredNotifications"
            row-key="id"
            :pagination="{ pageSize: 10, showTotal: total => `共 ${total} 条` }"
            :scroll="{ x: 1100 }"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'reader'">
                <div class="text-primary">{{ record.readerName }}</div>
              </template>
              <template v-else-if="column.key === 'book'">
                <div class="text-primary">{{ record.bookTitle }}</div>
                <div class="text-secondary">预约单号 #{{ record.reservationId }}</div>
              </template>
              <template v-else-if="column.key === 'status'">
                <a-tag v-if="record.status === 'sending'" color="processing">
                  <LoadingOutlined /> 发送中
                </a-tag>
                <a-tag v-else-if="record.status === 'sent'" color="success">
                  <CheckCircleOutlined /> 已发送
                </a-tag>
                <a-tag v-else color="error">
                  <CloseCircleOutlined /> 发送失败
                </a-tag>
              </template>
              <template v-else-if="column.key === 'sentAt'">
                <span>{{ record.sentAt || '—' }}</span>
              </template>
              <template v-else-if="column.key === 'error'">
                <span v-if="record.error" class="error-text">{{ record.error }}</span>
                <span v-else class="text-secondary">—</span>
              </template>
              <template v-else-if="column.key === 'action'">
                <a-button
                  v-if="record.status === 'failed'"
                  type="link"
                  size="small"
                  class="table-action-btn"
                  @click="handleRetry(record)"
                >
                  <ReloadOutlined /> 重试
                </a-button>
                <span v-else class="text-secondary">—</span>
              </template>
            </template>
          </a-table>
        </a-tab-pane>
      </a-tabs>
    </div>

    <!-- 新增预约弹窗 -->
    <a-modal
      v-model:open="reserveModalVisible"
      title="新增预约登记"
      :confirm-loading="submitLoading"
      ok-text="登记预约"
      cancel-text="取消"
      @ok="handleReserveSubmit"
      @cancel="handleReserveModalClose"
      width="520px"
    >
      <a-alert type="info" show-icon class="reserve-tip">
        <template #message>
          仅支持无库存图书预约；库存释放后按候补顺序发送到馆通知，取书保留 {{ PICKUP_HOLD_DAYS }} 天。
        </template>
      </a-alert>
      <a-form
        ref="reserveFormRef"
        :model="reserveForm"
        :rules="reserveRules"
        :label-col="{ span: 5 }"
        :wrapper-col="{ span: 18 }"
      >
        <a-form-item label="读者" name="readerId">
          <a-select
            v-model:value="reserveForm.readerId"
            placeholder="请选择读者"
            show-search
            :filter-option="filterReaderOption"
          >
            <a-select-option
              v-for="reader in availableReaders"
              :key="reader.id"
              :value="reader.id"
              :label="reader.name"
            >
              {{ reader.name }} ({{ reader.cardNo }})
            </a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="预约图书" name="bookId">
          <a-select
            v-model:value="reserveForm.bookId"
            placeholder="请选择无库存图书"
            show-search
            :filter-option="filterBookOption"
          >
            <a-select-option
              v-for="book in reservableBooks"
              :key="book.id"
              :value="book.id"
              :label="book.title"
            >
              {{ book.title }}（当前排队 {{ reservationStore.getQueueCount(book.id) }} 人）
            </a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item v-if="reserveForm.bookId" label="队列情况" :wrapper-col="{ offset: 0 }">
          <span class="queue-hint">
            该图书已有 <strong>{{ selectedBookQueueCount }}</strong> 位读者候补，
            登记后将排在第 <strong>{{ selectedBookQueueCount + 1 }}</strong> 位
          </span>
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { message } from 'ant-design-vue'
import dayjs from 'dayjs'
import {
  PlusOutlined,
  CheckOutlined,
  CloseOutlined,
  ReloadOutlined,
  SearchOutlined,
  OrderedListOutlined,
  BellOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  ClockCircleOutlined,
  WarningOutlined,
  AlertOutlined,
  ScheduleOutlined,
  SoundOutlined,
  LoadingOutlined,
  FieldTimeOutlined,
  QuestionCircleOutlined
} from '@ant-design/icons-vue'
import { useReservationStore, PICKUP_HOLD_DAYS } from '@/stores/reservation'
import { useReaderStore } from '@/stores/reader'
import { useBookStore } from '@/stores/book'

const reservationStore = useReservationStore()
const readerStore = useReaderStore()
const bookStore = useBookStore()

const activeTab = ref('list')
const searchKeyword = ref('')
const selectedStatus = ref(null)
const selectedBookId = ref(null)
const notifyKeyword = ref('')
const notifyStatus = ref(null)
const reserveModalVisible = ref(false)
const submitLoading = ref(false)
const reserveFormRef = ref(null)

const reserveForm = reactive({
  readerId: null,
  bookId: null
})

const reserveRules = {
  readerId: [{ required: true, message: '请选择读者' }],
  bookId: [{ required: true, message: '请选择预约图书' }]
}

const reservationColumns = [
  { title: '读者信息', key: 'reader', width: 140 },
  { title: '图书信息', key: 'book', width: 200 },
  { title: '排队位次', key: 'position', width: 100 },
  { title: '状态', key: 'status', width: 90 },
  { title: '申请时间', dataIndex: 'createdAt', key: 'createdAt', width: 160 },
  { title: '通知时间', dataIndex: 'notifiedAt', key: 'notifiedAt', width: 160 },
  { title: '取书截止', dataIndex: 'expireAt', key: 'expireAt', width: 190 },
  { title: '操作', key: 'action', width: 190, fixed: 'right' }
]

const notificationColumns = [
  { title: '编号', dataIndex: 'id', key: 'id', width: 70 },
  { title: '读者', key: 'reader', width: 110 },
  { title: '图书', key: 'book', width: 190 },
  { title: '状态', key: 'status', width: 110 },
  { title: '重试次数', dataIndex: 'retryCount', key: 'retryCount', width: 90 },
  { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', width: 160 },
  { title: '发送时间', dataIndex: 'sentAt', key: 'sentAt', width: 160 },
  { title: '失败原因', key: 'error', width: 200 },
  { title: '操作', key: 'action', width: 90, fixed: 'right' }
]

// ========================================
// 预约队列
// ========================================
const hasFilters = computed(() =>
  searchKeyword.value || selectedStatus.value || selectedBookId.value
)

const reservedBookOptions = computed(() => {
  const seen = new Map()
  reservationStore.reservations.forEach(r => {
    if (!seen.has(r.bookId)) {
      seen.set(r.bookId, { id: r.bookId, title: r.bookTitle })
    }
  })
  return [...seen.values()]
})

const filteredReservations = computed(() => {
  let result = [...reservationStore.reservations]

  if (searchKeyword.value) {
    const keyword = searchKeyword.value.toLowerCase()
    result = result.filter(r =>
      r.readerName.toLowerCase().includes(keyword) ||
      r.bookTitle.toLowerCase().includes(keyword) ||
      r.cardNo.toLowerCase().includes(keyword)
    )
  }

  if (selectedStatus.value) {
    result = result.filter(r => r.status === selectedStatus.value)
  }

  if (selectedBookId.value) {
    result = result.filter(r => r.bookId === selectedBookId.value)
    // 查看单本图书时按候补顺序展示，便于核对队列先后
    result.sort((a, b) => {
      const pa = reservationStore.getQueuePosition(a)
      const pb = reservationStore.getQueuePosition(b)
      if (pa === null && pb === null) return b.createdAt.localeCompare(a.createdAt)
      if (pa === null) return 1
      if (pb === null) return -1
      return pa - pb
    })
  } else {
    result.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  return result
})

function positionOf(record) {
  return reservationStore.getQueuePosition(record)
}

function statusColor(status) {
  const colors = {
    waiting: 'gold',
    notified: 'processing',
    fulfilled: 'success',
    cancelled: 'default',
    expired: 'error'
  }
  return colors[status] || 'default'
}

function statusText(status) {
  const texts = {
    waiting: '排队中',
    notified: '待取书',
    fulfilled: '已到馆',
    cancelled: '已取消',
    expired: '已过期'
  }
  return texts[status] || status
}

function isTerminal(status) {
  return ['fulfilled', 'cancelled', 'expired'].includes(status)
}

function isExpiringSoon(record) {
  return record.expireAt && dayjs(record.expireAt).diff(dayjs(), 'hour') < 24
}

function expireHint(record) {
  const hours = dayjs(record.expireAt).diff(dayjs(), 'hour')
  if (hours <= 0) return '已超期'
  if (hours < 24) return `剩余 ${hours} 小时，即将过期`
  return `剩余 ${Math.floor(hours / 24)} 天`
}

function clearFilters() {
  searchKeyword.value = ''
  selectedStatus.value = null
  selectedBookId.value = null
}

// ========================================
// 通知记录
// ========================================
const filteredNotifications = computed(() => {
  let result = [...reservationStore.notifications]

  if (notifyKeyword.value) {
    const keyword = notifyKeyword.value.toLowerCase()
    result = result.filter(n =>
      n.readerName.toLowerCase().includes(keyword) ||
      n.bookTitle.toLowerCase().includes(keyword)
    )
  }

  if (notifyStatus.value) {
    result = result.filter(n => n.status === notifyStatus.value)
  }

  result.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return result
})

function handleRetry(record) {
  const ok = reservationStore.retryNotification(record.id)
  if (ok) {
    message.info(`正在为「${record.readerName}」重新发送到馆通知...`)
  }
}

// ========================================
// 操作
// ========================================
function handleCancel(record) {
  const result = reservationStore.cancelReservation(record.id)
  if (result.ok) {
    message.success(
      result.released
        ? '预约已取消，保留副本已顺延给下一位候补读者'
        : '预约已取消'
    )
  } else {
    message.error(result.message)
  }
}

function handleConfirmArrival(record) {
  const result = reservationStore.confirmArrival(record.id)
  if (result.ok) {
    message.success(`「${record.readerName}」到馆确认成功，已自动办理借阅`)
  } else {
    message.error(result.message)
  }
}

function handleCheckExpired() {
  const count = reservationStore.expireOverdue()
  if (count > 0) {
    message.success(`检查完成，已处理 ${count} 条超期预约，库存已按候补顺序顺延`)
  } else {
    message.info('检查完成，暂无超期未取的预约')
  }
}

// ========================================
// 新增预约
// ========================================
const availableReaders = computed(() =>
  readerStore.readers.filter(r => r.status === 'active')
)

// 仅无库存馆藏可登记预约
const reservableBooks = computed(() =>
  bookStore.books.filter(b => b.available === 0)
)

const selectedBookQueueCount = computed(() =>
  reserveForm.bookId ? reservationStore.getQueueCount(reserveForm.bookId) : 0
)

function filterReaderOption(input, option) {
  return option.label.toLowerCase().includes(input.toLowerCase())
}

function filterBookOption(input, option) {
  return option.label.toLowerCase().includes(input.toLowerCase())
}

function showReserveModal() {
  reserveForm.readerId = null
  reserveForm.bookId = null
  reserveModalVisible.value = true
  nextTick(() => {
    reserveFormRef.value?.clearValidate()
  })
}

function handleReserveModalClose() {
  nextTick(() => {
    reserveFormRef.value?.resetFields()
  })
}

async function handleReserveSubmit() {
  try {
    await reserveFormRef.value.validate()
    submitLoading.value = true
    await new Promise(resolve => setTimeout(resolve, 300))

    const result = reservationStore.addReservation({
      readerId: reserveForm.readerId,
      bookId: reserveForm.bookId
    })

    if (result.ok) {
      message.success(`预约登记成功，当前排队第 ${result.position} 位`)
      reserveModalVisible.value = false
    } else {
      message.error(result.message)
    }
  } catch (error) {
    console.error('表单验证失败:', error)
  } finally {
    submitLoading.value = false
  }
}

// ========================================
// 进入页面时对齐状态，并周期检查过期（防止重新进入后状态错位）
// ========================================
let expireTimer = null

onMounted(() => {
  reservationStore.reconcile()
  expireTimer = setInterval(() => {
    const count = reservationStore.expireOverdue()
    if (count > 0) {
      message.info(`已自动处理 ${count} 条超期未取预约，库存已顺延`)
    }
  }, 30000)
})

onUnmounted(() => {
  if (expireTimer) {
    clearInterval(expireTimer)
  }
})
</script>

<style lang="less" scoped>
.reservation-list {
  .page-title {
    font-size: 20px;
    font-weight: 600;
    color: #1a1a1a;
    margin-bottom: 24px;
  }
}

.stat-row {
  margin-bottom: 16px;
}

.stat-card-rich {
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  transition: all 0.3s ease;
  border-left: 4px solid transparent;
  height: 100%;

  &:hover {
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  }

  &.waiting {
    border-left-color: #faad14;
    .stat-card-icon { background: linear-gradient(135deg, #faad14 0%, #ffc53d 100%); }
    .stat-card-value { color: #faad14; }
  }

  &.notified {
    border-left-color: #1890ff;
    .stat-card-icon { background: linear-gradient(135deg, #1890ff 0%, #40a9ff 100%); }
    .stat-card-value { color: #1890ff; }
  }

  &.fulfilled {
    border-left-color: #52c41a;
    .stat-card-icon { background: linear-gradient(135deg, #52c41a 0%, #73d13d 100%); }
    .stat-card-value { color: #52c41a; }
  }

  &.failed {
    border-left-color: #ff4d4f;
    .stat-card-icon { background: linear-gradient(135deg, #ff4d4f 0%, #ff7875 100%); }
    .stat-card-value { color: #ff4d4f; }
  }

  .stat-card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;

    .stat-card-icon {
      width: 40px;
      height: 40px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      color: #fff;
    }

    .stat-card-badge {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      background: #e6f7ff;
      color: #1890ff;

      &.warning {
        background: #fff2e8;
        color: #fa541c;
        animation: pulse 1.5s infinite;
      }
    }
  }

  .stat-card-body {
    margin-bottom: 12px;

    .stat-card-value {
      font-size: 32px;
      font-weight: 700;
      line-height: 1.2;
    }

    .stat-card-label {
      font-size: 14px;
      color: #999;
      margin-top: 4px;
    }
  }

  .stat-card-footer {
    font-size: 12px;
    color: #999;
    padding-top: 12px;
    border-top: 1px dashed #f0f0f0;

    .warning-text {
      color: #fa541c;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .success-text {
      color: #52c41a;
      display: flex;
      align-items: center;
      gap: 4px;
    }
  }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fade-in {
  animation: fadeIn 0.5s ease-out both;
}

.animate-slide-down {
  animation: slideDown 0.5s ease-out both;
}

.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.3s ease;
}

.fade-slide-enter-from,
.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

.search-area {
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  padding: 20px;
  margin-bottom: 16px;
  transition: all 0.3s ease;

  &:hover {
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
  }

  .add-btn {
    transition: all 0.3s ease;

    &:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(24, 144, 255, 0.4);
    }
  }

  .outage-switch {
    display: inline-flex;
    align-items: center;
    gap: 8px;

    .outage-label {
      font-size: 13px;
      color: #666;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
  }
}

.table-container {
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  padding: 20px;
  transition: all 0.3s ease;

  &:hover {
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
  }

  .filter-row {
    margin-bottom: 16px;
    row-gap: 12px;
  }

  .filter-tip-col {
    text-align: right;
  }

  .search-icon {
    color: rgba(0, 0, 0, 0.45);
  }

  .search-result-tip {
    display: inline-flex;
    align-items: center;
    gap: 8px;

    .result-count {
      color: #666;
      font-size: 13px;

      strong {
        color: #faad14;
        font-size: 16px;
        margin: 0 4px;
      }
    }
  }

  :deep(.ant-table-tbody) {
    .ant-table-row {
      &:hover td {
        background: #fafafa !important;
      }
    }
  }

  .table-action-btn {
    padding: 2px 4px;
    height: auto;
    border-radius: 4px;
  }

  .completed-text {
    color: #52c41a;
    font-size: 12px;
    display: flex;
    align-items: center;
    gap: 4px;
  }
}

.text-primary {
  font-weight: 500;
  color: #1a1a1a;
}

.text-secondary {
  font-size: 12px;
  color: #999;
}

.position-tag {
  min-width: 60px;
  text-align: center;
}

.expire-hint {
  font-size: 12px;
  color: #999;
  margin-top: 2px;

  &.urgent {
    color: #fa541c;
  }
}

.error-text {
  color: #ff4d4f;
  font-size: 12px;
}

.reserve-tip {
  margin-bottom: 16px;
}

.queue-hint {
  font-size: 13px;
  color: #666;

  strong {
    color: #faad14;
    font-size: 15px;
    margin: 0 2px;
  }
}
</style>
